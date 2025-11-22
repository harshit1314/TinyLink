import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { links } from '@/db/schema';
import { isValidUrl, isValidShortCode, generateShortCode } from '@/lib/utils';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const allLinks = await db.select().from(links).orderBy(desc(links.createdAt));
    return NextResponse.json(allLinks);
  } catch (error) {
    console.error('Error fetching links:', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetUrl, customCode } = body;

    if (!targetUrl || !isValidUrl(targetUrl)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    let shortCode = customCode;

    if (shortCode) {
      if (!isValidShortCode(shortCode)) {
        return NextResponse.json({ error: 'Invalid custom code format' }, { status: 400 });
      }
      
      // Check if custom code exists
      const existing = await db.select().from(links).where(eq(links.shortCode, shortCode));
      if (existing.length > 0) {
        return NextResponse.json({ error: 'Short code already exists' }, { status: 409 });
      }
    } else {
      // Generate unique code
      let isUnique = false;
      while (!isUnique) {
        shortCode = generateShortCode();
        const existing = await db.select().from(links).where(eq(links.shortCode, shortCode));
        if (existing.length === 0) {
          isUnique = true;
        }
      }
    }

    try {
      const [newLink] = await db.insert(links).values({
        targetUrl,
        shortCode,
      }).returning();

      return NextResponse.json(newLink, { status: 201 });
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === '23505') { // Postgres unique violation code
         return NextResponse.json({ error: 'Short code already exists' }, { status: 409 });
      }
      throw error;
    }

  } catch (error) {
    console.error('Error creating link:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
