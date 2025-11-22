require('dotenv').config();
const { Client } = require('pg');

async function test() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: conn, connectionTimeoutMillis: 3000 });
  try {
    console.log('Connecting to Postgres (3s timeout)...');
    await client.connect();
    const timeoutMs = 3000;
    const q = client.query('SELECT 1');
    const res = await Promise.race([
      q,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Query timeout')), timeoutMs))
    ]);
    console.log('Query result:', res && res.rows ? res.rows : res);
  } catch (err) {
    console.error('DB test failed:', err.message || err);
    process.exitCode = 2;
  } finally {
    try { await client.end(); } catch (_) {}
  }
}

test();
