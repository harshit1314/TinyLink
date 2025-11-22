import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Check database connection
    await db.execute(sql`SELECT 1`);
    
    return NextResponse.json({ 
      ok: true, 
      version: "1.0",
      database: "connected",
      uptime: process.uptime()
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ 
      ok: false, 
      version: "1.0",
      database: "disconnected" 
    }, { status: 503 });
  }
}
