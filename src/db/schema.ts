import { pgTable, serial, text, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

export const links = pgTable('links', {
  id: serial('id').primaryKey(),
  shortCode: varchar('short_code', { length: 8 }).notNull().unique(),
  targetUrl: text('target_url').notNull(),
  totalClicks: integer('total_clicks').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastClickedAt: timestamp('last_clicked_at'),
});

export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
