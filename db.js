const { Pool } = require('pg');
const dns = require('dns').promises;
const path = require('path');
const fs = require('fs').promises;

const DB_FILE = process.env.JSON_DB_FILE || path.join(__dirname, 'data.json');
const DATABASE_URL = process.env.DATABASE_URL;

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

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

async function initPg() {
  if (!DATABASE_URL) return;
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
      await dns.lookup(parsed.hostname);
    } catch (dnsErr) {
      console.warn('DNS lookup for DATABASE_URL host failed (non-fatal):', dnsErr && dnsErr.message ? dnsErr.message : dnsErr);
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
    await withTimeout(pool.query('SELECT 1'), 4000, 'pg ping timeout');
    // Only run create-table during explicit migration runs. This avoids long startup
    // work on cold starts that can cause function invocation timeouts.
    if (process.env.RUN_DB_INIT === '1') {
      await withTimeout(pool.query(create), 4000, 'pg create table timeout');
      console.info('Postgres initialized and links table ensured');
    } else {
      console.info('Postgres reachable; skipping runtime schema creation (RUN_DB_INIT not set)');
    }
  } catch (e) {
    console.error('Postgres init failed or timed out; falling back to memory store:', e && e.message ? e.message : e);
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
  // If pool is ready and DB is not in backoff, use it. If not, start init async and fall back to memory.
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      await withTimeout(pool.query('INSERT INTO links(code, url, clicks, created_at) VALUES($1,$2,0,now())', [code, url]), 3000, 'pg insert timeout');
      return;
    } catch (e) {
      console.error('DB insert failed, falling back to memory:', e && e.message ? e.message : e);
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
}

async function getLink(code) {
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      const r = await withTimeout(pool.query('SELECT code, url, clicks, created_at, last_clicked FROM links WHERE code = $1', [code]), 3000, 'pg get timeout');
      return r.rows[0] || null;
    } catch (e) {
      console.error('DB getLink failed, falling back to memory:', e && e.message ? e.message : e);
      try { await pool.end(); } catch(_){}
      pool = null;
      const backoff = parseInt(process.env.DB_BACKOFF_MS || '60000', 10);
      dbUnavailableUntil = Date.now() + backoff;
    }
  }
  if (DATABASE_URL && !pool && !initializing && Date.now() >= dbUnavailableUntil) initPg().catch(()=>{});
  return memory.links.find(l => l.code === code) || null;
}

async function listLinks() {
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      const r = await withTimeout(pool.query('SELECT code, url, clicks, created_at, last_clicked FROM links ORDER BY created_at DESC'), 3000, 'pg list timeout');
      return r.rows;
    } catch (e) {
      console.error('DB listLinks failed, falling back to memory:', e && e.message ? e.message : e);
      try { await pool.end(); } catch(_){}
      pool = null;
      const backoff = parseInt(process.env.DB_BACKOFF_MS || '60000', 10);
      dbUnavailableUntil = Date.now() + backoff;
    }
  }
  if (DATABASE_URL && !pool && !initializing && Date.now() >= dbUnavailableUntil) initPg().catch(()=>{});
  return memory.links.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
}

async function incrementClick(code) {
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      const r = await withTimeout(pool.query('UPDATE links SET clicks = clicks + 1, last_clicked = now() WHERE code = $1 RETURNING code, url, clicks, created_at, last_clicked', [code]), 3000, 'pg update timeout');
      return r.rows[0] || null;
    } catch (e) {
      console.error('DB incrementClick failed, falling back to memory:', e && e.message ? e.message : e);
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
  return item;
}

async function deleteLink(code) {
  if (DATABASE_URL && pool && Date.now() >= dbUnavailableUntil) {
    try {
      const r = await withTimeout(pool.query('DELETE FROM links WHERE code = $1 RETURNING code', [code]), 3000, 'pg delete timeout');
      return { changed: r.rowCount };
    } catch (e) {
      console.error('DB deleteLink failed, falling back to memory:', e && e.message ? e.message : e);
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
  return { changed: before - memory.links.length };
}

module.exports = {
  createLink,
  getLink,
  listLinks,
  incrementClick,
  deleteLink
};
