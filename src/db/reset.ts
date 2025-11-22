import { db } from './index';
import { sql } from 'drizzle-orm';

async function reset() {
  console.log('Resetting database...');
  try {
    await db.execute(sql`DROP TABLE IF EXISTS links`);
    await db.execute(sql`DROP TABLE IF EXISTS __drizzle_migrations`);
    console.log('Tables dropped.');
  } catch (error) {
    console.error('Error resetting database:', error);
  }
  process.exit(0);
}

reset();
