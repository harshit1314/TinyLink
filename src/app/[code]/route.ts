import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { links } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;

  try {
    const [link] = await db.select().from(links).where(eq(links.shortCode, code));

    if (!link) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Update stats
    await db.update(links)
      .set({
        totalClicks: sql`${links.totalClicks} + 1`,
        lastClickedAt: new Date(),
      })
      .where(eq(links.id, link.id));

    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: link.targetUrl,
      },
    });
  } catch (error) {
    console.error('Error redirecting:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
