CREATE TABLE IF NOT EXISTS "links" (
	"id" serial PRIMARY KEY NOT NULL,
	"short_code" varchar(8) NOT NULL,
	"target_url" text NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_clicked_at" timestamp,
	CONSTRAINT "links_short_code_unique" UNIQUE("short_code")
);
