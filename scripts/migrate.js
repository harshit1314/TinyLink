#!/usr/bin/env node
// scripts/migrate.js
// Run database initialization/migration (creates links table if missing)
const { Pool } = require('pg');

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set. Set it and retry.');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    console.log('Connecting to Postgres...');
    await pool.query('SELECT 1');
    console.log('Connected. Ensuring links table exists...');
    const create = `
      CREATE TABLE IF NOT EXISTS links (
        code VARCHAR(64) PRIMARY KEY,
        url TEXT NOT NULL,
        clicks INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_clicked TIMESTAMPTZ
      );
    `;
    await pool.query(create);
    console.log('Migration finished: links table is present.');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e && e.message ? e.message : e);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch(_){}
  }
}

main();
