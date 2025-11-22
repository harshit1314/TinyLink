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

let pool;
let dnsChecked = false;
async function initPg() {
  if (!DATABASE_URL) return;
  if (pool) return;
  // Configure pool for serverless: small pool and short timeouts so it fails fast instead
  // Tune for Neon: pooler hosts should be used with a small client-side pool.
  const isNeon = DATABASE_URL.includes('.neon.tech') || DATABASE_URL.includes('neon.');
  const isPooler = DATABASE_URL.includes('pooler');

  const poolOpts = {
    connectionString: DATABASE_URL,
    max: process.env.VERCEL ? (isPooler ? 2 : 1) : (isPooler ? 6 : 10),
    connectionTimeoutMillis: 4000,
    idleTimeoutMillis: 10000,
  };

  // Some hosts (Neon) require SSL; allow override via DB_SSL or PGSSLMODE
  const needSSL = !!process.env.DB_SSL || (process.env.PGSSLMODE === 'require') || isNeon || !!process.env.VERCEL;
  if (needSSL) poolOpts.ssl = { rejectUnauthorized: false };

  // Before creating the pool, optionally resolve the hostname once so DNS issues are visible in logs.
  if (!dnsChecked) {
    dnsChecked = true;
    try {
      const parsed = new URL(DATABASE_URL);
      const host = parsed.hostname;
      // quick DNS lookup to surface obvious misconfiguration (but do NOT throw; allow connection attempt)
      await dns.lookup(host);
    } catch (dnsErr) {
      console.warn('Warning: DNS lookup for DATABASE_URL host failed or was busy. Will continue and let the driver attempt connection. Error:', dnsErr && dnsErr.message ? dnsErr.message : dnsErr);
      // don't throw — in some serverless environments dns.lookup may be unreliable (EBUSY); allow pool to try
    }
  }

  pool = new Pool(poolOpts);

  // Create table if not exists, but guard with a short timeout to avoid function invocation timeout
  const create = `
    CREATE TABLE IF NOT EXISTS links (
      code VARCHAR(64) PRIMARY KEY,
      url TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0,
      try {
      last_clicked TIMESTAMPTZ
    );
  `;

  // Helper to run a promise with a timeout
        console.warn('DNS lookup for DATABASE_URL host failed (will fallback to memory if needed):', dnsErr && dnsErr.message ? dnsErr.message : dnsErr);
        // allow init to continue; the subsequent pool creation/queries will surface errors

  // Try a quick connectivity check then create table; if either fails, clean up pool and fall back
  try {
    await withTimeout(pool.query('SELECT 1'), 4000, 'pg ping timeout');
    await withTimeout(pool.query(create), 4000, 'pg create table timeout');
  } catch (e) {
    console.error('Postgres init failed or timed out; falling back to memory store:', e && e.message ? e.message : e);
    try { await pool.end(); } catch(_){}
    pool = null;
  }
}

// Initialize memory file for local dev
ensureLocalFile().catch(()=>{});

async function createLink({ code, url }) {
  if (DATABASE_URL) {
    await initPg();
    try {
      await pool.query('INSERT INTO links(code, url, clicks, created_at) VALUES($1,$2,0,now())', [code, url]);
      return;
    } catch (e) {
      if (e && e.code === '23505') throw new Error('exists');
      throw e;
    }
  }

  // local / memory
  if (memory.links.find(l => l.code === code)) throw new Error('exists');
  const now = new Date().toISOString();
  memory.links.push({ code, url, clicks: 0, created_at: now, last_clicked: null });
  try { await fs.writeFile(DB_FILE, JSON.stringify({ links: memory.links }, null, 2), 'utf8'); } catch (e) {}
}

async function getLink(code) {
  if (DATABASE_URL) {
    await initPg();
    const r = await pool.query('SELECT code, url, clicks, created_at, last_clicked FROM links WHERE code = $1', [code]);
    return r.rows[0] || null;
  }
  return memory.links.find(l => l.code === code) || null;
}

async function listLinks() {
  if (DATABASE_URL) {
    await initPg();
    const r = await pool.query('SELECT code, url, clicks, created_at, last_clicked FROM links ORDER BY created_at DESC');
    return r.rows;
  }
  return memory.links.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
}

async function incrementClick(code) {
  if (DATABASE_URL) {
    await initPg();
    const r = await pool.query('UPDATE links SET clicks = clicks + 1, last_clicked = now() WHERE code = $1 RETURNING code, url, clicks, created_at, last_clicked', [code]);
    return r.rows[0] || null;
  }
  const item = memory.links.find(l => l.code === code);
  if (!item) return null;
  item.clicks = (item.clicks || 0) + 1;
  item.last_clicked = new Date().toISOString();
  try { await fs.writeFile(DB_FILE, JSON.stringify({ links: memory.links }, null, 2), 'utf8'); } catch (e) {}
  return item;
}

async function deleteLink(code) {
  if (DATABASE_URL) {
    await initPg();
    const r = await pool.query('DELETE FROM links WHERE code = $1 RETURNING code', [code]);
    return { changed: r.rowCount };
  }
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
