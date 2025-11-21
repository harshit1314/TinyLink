const serverless = require('serverless-http');
const app = require('../server');
const { Pool } = require('pg');

// Lightweight diagnostic: return environment and DB ping if possible.
module.exports = async (req, res) => {
  // If called as a serverless handler wrapper, pass through to serverless-http
  // But also support direct invocation for a simple JSON response
  const DATABASE_URL = process.env.DATABASE_URL || null;
  const info = {
    ok: true,
    env: {
      vercel: !!process.env.VERCEL,
      database_url: !!DATABASE_URL
    }
  };
  if (DATABASE_URL) {
    // quick connectivity test
    try {
      const pool = new Pool({ connectionString: DATABASE_URL });
      const r = await pool.query('SELECT 1');
      await pool.end();
      info.db = { ok: true };
    } catch (e) {
      info.db = { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify(info));
};
