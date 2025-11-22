const { Pool } = require('pg');
const dns = require('dns').promises;
const path = require('path');
const fs = require('fs').promises;

const DB_FILE = process.env.JSON_DB_FILE || path.join(__dirname, 'data.json');
const DATABASE_URL = process.env.DATABASE_URL;
// Detect when Vercel's pulled `.env` contains masked values like "..." which
// will cause confusing DNS errors. If detected, treat as absent and log a
// clear actionable message so the deployment author can fix the env var.
const DATABASE_URL_MASKED = typeof DATABASE_URL === 'string' && DATABASE_URL.includes('...');
if (DATABASE_URL_MASKED) {
  console.error('DATABASE_URL looks masked (contains "..."). Replace with the full Neon/Postgres URL in Vercel/your .env before attempting to use Postgres. Falling back to local memory store.');
}

// In-memory fallback store for non-Postgres / serverless environments
const memory = { links: [] };

async function ensureLocalFile() {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    memory.links = JSON.parse(raw).links || [];
  } catch (e) {
    memory.links = memory.links || [];
    try {
      await fs.writeFile(DB_FILE, JSON.stringify({ links: memory.links }, null, 2), 'utf8');
    } catch (_) {}
  }
}

let pool = null;
let initializing = false;
let dnsChecked = false;
let dbUnavailableUntil = 0;
const DB_SKIP_INIT = (process.env.DB_SKIP_INIT === '1' || process.env.DB_SKIP_INIT === 'true');
const now = () => new Date().toISOString();

console.info(`[DB] module loaded. DATABASE_URL ${DATABASE_URL ? 'present' : 'absent'}, DB_SKIP_INIT=${DB_SKIP_INIT}`);

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

async function initPg() {
  if (!DATABASE_URL || DATABASE_URL_MASKED) return;
  if (DB_SKIP_INIT) {
    console.info('DB_SKIP_INIT is set — skipping Postgres init and using memory fallback.');
    // Avoid attempting initialization for a while so serverless cold starts don't hang
    dbUnavailableUntil = Date.now() + (parseInt(process.env.DB_SKIP_MS || '86400000', 10));
    return;
  }
  console.info(`[DB] initPg starting at ${now()}`);
  if (pool || initializing) return;
  initializing = true;

  // Tune pool options for Neon / serverless
  const isNeon = DATABASE_URL.includes('.neon.tech') || DATABASE_URL.includes('neon.');
  const isPooler = DATABASE_URL.includes('pooler');
  const poolOpts = {
    connectionString: DATABASE_URL,
    max: process.env.VERCEL ? (isPooler ? 2 : 1) : (isPooler ? 6 : 10),
    connectionTimeoutMillis: 4000,
    idleTimeoutMillis: 10000,
  };
  const needSSL = !!process.env.DB_SSL || (process.env.PGSSLMODE === 'require') || isNeon || !!process.env.VERCEL;
  if (needSSL) poolOpts.ssl = { rejectUnauthorized: false };

  // Quick DNS check (don't throw) — just log to help diagnostics
  if (!dnsChecked) {
    dnsChecked = true;
    try {
      const parsed = new URL(DATABASE_URL);
      console.info(`[DB] DNS lookup for host=${parsed.hostname} started at ${now()}`);
      const dnsStart = Date.now();
      await dns.lookup(parsed.hostname);
      console.info(`[DB] DNS lookup for host=${parsed.hostname} finished in ${Date.now()-dnsStart}ms`);
    } catch (dnsErr) {
      console.warn('[DB] DNS lookup for DATABASE_URL host failed (non-fatal):', dnsErr && dnsErr.message ? dnsErr.message : dnsErr);
    }
  }

  pool = new Pool(poolOpts);

  const create = `
    CREATE TABLE IF NOT EXISTS links (
      code VARCHAR(64) PRIMARY KEY,
      url TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_clicked TIMESTAMPTZ
    );
  `;

  try {
    // quick ping to ensure the DB is reachable; avoid running migrations here in serverless runtime
    console.info('[DB] pg ping starting at', now());
    const pingStart = Date.now();
    await withTimeout(pool.query('SELECT 1'), 4000, 'pg ping timeout');
    console.info(`[DB] pg ping success in ${Date.now()-pingStart}ms`);
    // Only run create-table during explicit migration runs. This avoids long startup
    // work on cold starts that can cause function invocation timeouts.
    if (process.env.RUN_DB_INIT === '1') {
      await withTimeout(pool.query(create), 4000, 'pg create table timeout');
      console.info('Postgres initialized and links table ensured');
    } else {
      console.info('Postgres reachable; skipping runtime schema creation (RUN_DB_INIT not set)');
    }
  } catch (e) {
    console.error('[DB] Postgres init failed or timed out; falling back to memory store:', e && e.message ? e.message : e);
    try { await pool.end(); } catch (_) {}
    pool = null;
      // back off further attempts for a short period to avoid repeated cold-start hangs
      const backoff = parseInt(process.env.DB_BACKOFF_MS || '60000', 10);
      dbUnavailableUntil = Date.now() + backoff;
  } finally {
    initializing = false;
  }
}

ensureLocalFile().catch(()=>{});

async function createLink({ code, url }) {
  const start = Date.now();
  console.info(`[DB] createLink start code=${code} url=${url} at ${now()}`);
  // If pool is ready and DB is not in backoff, use it. If not, start init async and fall back to memory.
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      await withTimeout(pool.query('INSERT INTO links(code, url, clicks, created_at) VALUES($1,$2,0,now())', [code, url]), 3000, 'pg insert timeout');
      console.info(`[DB] createLink: inserted code=${code} via Postgres in ${Date.now()-start}ms`);
      return;
    } catch (e) {
      console.error('[DB] DB insert failed, falling back to memory:', e && e.message ? e.message : e);
      // close pool and backoff so we don't repeatedly hit a bad DB
      try { await pool.end(); } catch(_){}
      pool = null;
      const backoff = parseInt(process.env.DB_BACKOFF_MS || '60000', 10);
      dbUnavailableUntil = Date.now() + backoff;
      if (e && e.code === '23505') throw new Error('exists');
      // fall through to memory fallback
    }
  }

  // trigger async initialization if not already started
  if (DATABASE_URL && !pool && !initializing && Date.now() >= dbUnavailableUntil) initPg().catch(()=>{});

  // Fallback to local memory store
  if (memory.links.find(l => l.code === code)) throw new Error('exists');
  const now = new Date().toISOString();
  memory.links.push({ code, url, clicks: 0, created_at: now, last_clicked: null });
  try { await fs.writeFile(DB_FILE, JSON.stringify({ links: memory.links }, null, 2), 'utf8'); } catch (e) {}
  console.info(`[DB] createLink: stored code=${code} in memory fallback in ${Date.now()-start}ms`);
}

async function getLink(code) {
  const start = Date.now();
  console.info(`[DB] getLink start code=${code} at ${now()}`);
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      const r = await withTimeout(pool.query('SELECT code, url, clicks, created_at, last_clicked FROM links WHERE code = $1', [code]), 3000, 'pg get timeout');
      const row = r.rows[0] || null;
      if (row) return row;
      // If DB returned no row, attempt to return a memory-stored item if present.
      const mem = memory.links.find(l => l.code === code) || null;
      if (mem) {
        console.warn(`getLink: found code=${code} in memory fallback while DB had none`);
        return mem;
      }
      return null;
    } catch (e) {
      console.error('[DB] DB getLink failed, falling back to memory:', e && e.message ? e.message : e);
      try { await pool.end(); } catch(_){}
      pool = null;
      const backoff = parseInt(process.env.DB_BACKOFF_MS || '60000', 10);
      dbUnavailableUntil = Date.now() + backoff;
    }
  }
  if (DATABASE_URL && !pool && !initializing && Date.now() >= dbUnavailableUntil) initPg().catch(()=>{});
  const found = memory.links.find(l => l.code === code) || null;
  console.info(`[DB] getLink finished code=${code} found=${!!found} in ${Date.now()-start}ms`);
  return found;
}

async function listLinks() {
  const start = Date.now();
  console.info(`[DB] listLinks start at ${now()}`);
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      const r = await withTimeout(pool.query('SELECT code, url, clicks, created_at, last_clicked FROM links ORDER BY created_at DESC'), 3000, 'pg list timeout');
      return r.rows;
    } catch (e) {
      console.error('[DB] DB listLinks failed, falling back to memory:', e && e.message ? e.message : e);
      try { await pool.end(); } catch(_){}
      pool = null;
      const backoff = parseInt(process.env.DB_BACKOFF_MS || '60000', 10);
      dbUnavailableUntil = Date.now() + backoff;
    }
  }
  if (DATABASE_URL && !pool && !initializing && Date.now() >= dbUnavailableUntil) initPg().catch(()=>{});
  const out = memory.links.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
  console.info(`[DB] listLinks finished count=${out.length} in ${Date.now()-start}ms`);
  return out;
}

async function incrementClick(code) {
  const start = Date.now();
  console.info(`[DB] incrementClick start code=${code} at ${now()}`);
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      const r = await withTimeout(pool.query('UPDATE links SET clicks = clicks + 1, last_clicked = now() WHERE code = $1 RETURNING code, url, clicks, created_at, last_clicked', [code]), 3000, 'pg update timeout');
      return r.rows[0] || null;
    } catch (e) {
      console.error('[DB] DB incrementClick failed, falling back to memory:', e && e.message ? e.message : e);
      try { await pool.end(); } catch(_){}
      pool = null;
      const backoff = parseInt(process.env.DB_BACKOFF_MS || '60000', 10);
      dbUnavailableUntil = Date.now() + backoff;
    }
  }
  if (DATABASE_URL && !pool && !initializing && Date.now() >= dbUnavailableUntil) initPg().catch(()=>{});
  const item = memory.links.find(l => l.code === code);
  if (!item) return null;
  item.clicks = (item.clicks || 0) + 1;
  item.last_clicked = new Date().toISOString();
  try { await fs.writeFile(DB_FILE, JSON.stringify({ links: memory.links }, null, 2), 'utf8'); } catch (e) {}
  console.info(`[DB] incrementClick finished code=${code} now_clicks=${item.clicks} in ${Date.now()-start}ms`);
  return item;
}

async function deleteLink(code) {
  const start = Date.now();
  console.info(`[DB] deleteLink start code=${code} at ${now()}`);
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      const r = await withTimeout(pool.query('DELETE FROM links WHERE code = $1 RETURNING code', [code]), 3000, 'pg delete timeout');
      // If Postgres reports a deleted row, return success.
      if (r.rowCount && r.rowCount > 0) return { changed: r.rowCount };
      // Otherwise, try to delete from the memory fallback (in case the item
      // was created in-memory earlier during a DB outage).
      const before = memory.links.length;
      memory.links = memory.links.filter(l => l.code !== code);
      const after = memory.links.length;
      if (after !== before) {
        try { await fs.writeFile(DB_FILE, JSON.stringify({ links: memory.links }, null, 2), 'utf8'); } catch (e) {}
        console.warn(`deleteLink: item code=${code} removed from memory fallback after DB delete returned 0`);
        console.info(`[DB] deleteLink removed from memory fallback code=${code} in ${Date.now()-start}ms`);
        return { changed: before - after };
      }
      return { changed: 0 };
    } catch (e) {
      console.error('[DB] DB deleteLink failed, falling back to memory:', e && e.message ? e.message : e);
      try { await pool.end(); } catch(_){}
      pool = null;
      const backoff = parseInt(process.env.DB_BACKOFF_MS || '60000', 10);
      dbUnavailableUntil = Date.now() + backoff;
    }
  }
  if (DATABASE_URL && !pool && !initializing && Date.now() >= dbUnavailableUntil) initPg().catch(()=>{});
  const before = memory.links.length;
  memory.links = memory.links.filter(l => l.code !== code);
  try { await fs.writeFile(DB_FILE, JSON.stringify({ links: memory.links }, null, 2), 'utf8'); } catch (e) {}
  console.info(`[DB] deleteLink finished code=${code} changed=${before - memory.links.length} in ${Date.now()-start}ms`);
  return { changed: before - memory.links.length };
}

module.exports = {
  createLink,
  getLink,
  listLinks,
  incrementClick,
  deleteLink
};
