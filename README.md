# TinyLink

TinyLink is a minimal URL shortener built with Node.js and Express. It provides a small dashboard to create and manage short links, a stats page per code, and a redirect endpoint. The project supports two storage modes:

- Postgres (recommended) via the `DATABASE_URL` environment variable (Neon or other hosted Postgres).
- JSON file fallback (`data.json`) when `DATABASE_URL` is not set (useful for local testing).

This README explains how to run, test, and deploy the app, and documents the API and UI behavior required by the take-home assignment.

## Features

- Create short links (auto-generated or custom codes following `[A-Za-z0-9]{6,8}`).
- 302 redirect on `/:code` and increment click/count + update `last_clicked` time.
- Dashboard at `/` to create, search, sort, copy, and delete links.
- Stats page at `/code/:code` with link details, copy, and delete.
- Health endpoint at `/healthz` (returns JSON { ok: true, version: '1.0' }).
- Storage: Postgres (Neon) when `DATABASE_URL` is present; otherwise a local `data.json` file.

## Quick start (local)

1. Install dependencies

```powershell
cd 'C:\Users\harsh\OneDrive\Desktop\url_shortner'
npm install
```

2. Run locally (no DB)

```powershell
node server.js
# or during development with auto-reload:
npm run dev
```

3. Open the dashboard in your browser:

```powershell
start 'http://localhost:3000'
```

By default the app listens on port `3000`. To use a different port, set the `PORT` env var.

## Environment variables

- `DATABASE_URL` (optional): Postgres connection string. If set, the app uses Postgres (creates `links` table if missing).
- `BASE_URL` (optional): public base URL used in generated short URLs (defaults to `http://localhost:<PORT>`).
- `PORT` (optional): port to listen on (default: `3000`).

Example (PowerShell session):

```powershell
$env:DATABASE_URL = 'postgresql://user:pass@host:5432/dbname?sslmode=require'
$env:BASE_URL = 'http://localhost:3000'
node server.js
```

> Note: do NOT commit `.env` or any secrets to source control. Use `.env` locally and platform environment variables in production.

## API Endpoints (stable / autograder)

All endpoints are under the server root (replace `http://localhost:3000` with your `BASE_URL`).

- `GET /healthz` — health check (200):
	- Response: `{ "ok": true, "version": "1.0" }`

- `POST /api/links` — create a link
	- Request JSON: `{ "url": "https://...", "code": "ABC123" }` (`code` optional)
	- 201 Created: returns `{ "code": "abc123", "shortUrl": "<BASE_URL>/abc123", "url": "..." }`
	- 400 Bad Request: invalid URL or invalid code format
	- 409 Conflict: code already exists

- `GET /api/links` — list all links (200)

- `GET /api/links/:code` — stats for one code
	- 200: object with `code`, `url`, `clicks`, `created_at`, `last_clicked`
	- 404: not found

- `DELETE /api/links/:code` — delete a code
	- 200: `{ "ok": true }` on success
	- 404: not found

- `GET /:code` — redirect (302) to the original URL
	- behavior: increments click count and sets `last_clicked`; after deletion returns 404

These endpoints reflect the autograder requirements.

## Frontend

- Dashboard: `public/index.html` — create form with inline validation, search and sort, copy buttons, truncated URLs, empty/loading states.
- Stats: `public/code.html` — loads `/api/links/:code`, shows loading/error/not-found states and copy/delete actions.

Use the UI to verify the flows manually (create → click short URL → check stats → delete).

## Using Neon (Postgres) — quick guide

1. Create a Neon project and branch at https://neon.tech.
2. Get the full connection string (URI) from the Neon dashboard (it looks like `postgresql://user:pass@host/dbname?sslmode=require`).
3. Set `DATABASE_URL` in your environment (see examples above).
4. Start the app; `db.js` will run `CREATE TABLE IF NOT EXISTS links (...)` on first connection.

You can also run queries directly with `psql` or the Neon web console to inspect rows:

```powershell
psql 'postgresql://user:pass@host/dbname?sslmode=require'
-- in psql:
\dt
SELECT * FROM links ORDER BY created_at DESC LIMIT 20;
\q
```

## Sanity-check script

A PowerShell script that exercises the main flows is included at `scripts/check_endpoints.ps1`.
Run it in a separate terminal while the server is running:

```powershell
.\scripts\check_endpoints.ps1
```

It performs: `/healthz` → create link → stats → redirect (without auto-redirect) → verify clicks → delete → verify 404.

## Development notes

- `server.js` contains the Express app and routes.
- `db.js` provides a Postgres implementation (when `DATABASE_URL` is present) and a JSON fallback otherwise. All DB functions are async-compatible.
- Logging: requests are logged with `morgan` and errors are printed with `console.error`.

## Deployment

You can deploy to Render, Railway, or any Node host. Steps for a typical Render deployment:

1. Push this repository to GitHub.
2. Create a new Web Service on Render, link the repo, and set the start command to `node server.js`.
3. Add `DATABASE_URL` and `BASE_URL` as environment variables in the Render dashboard.

For Vercel it's recommended to convert this to a Next.js app (API routes + pages), but Render/Railway work fine for the current Express server.

## Security and production tips

- Never commit `DATABASE_URL` or `.env` to git. Use platform secrets.
- Use a dedicated DB role with restricted privileges for the app.
- For production, consider validating and normalizing URLs more strictly, rate-limiting link creation, and adding authentication if needed.

## Troubleshooting

- If the app cannot connect to Neon, check:
	- `DATABASE_URL` is set in the same environment that starts `node server.js`.
	- SSL requirements: `db.js` uses `ssl: { rejectUnauthorized: false }` by default to be compatible with many managed Postgres providers; adjust if your provider requires CA verification.
- If you see `Cannot GET /code/<code>` in the browser, restart the server after code changes; `server.js` registers a route to serve `public/code.html` at `/code/:code`.

## License

This project is provided under the MIT license.

---

If you'd like, I can:
- Add an explicit SQL migration file and `npm run migrate` command.
- Push the repo to GitHub and create deployment instructions for Render/Railway specific to Neon.
- Add automated tests (supertest for APIs, Playwright for UI flows).

Tell me which next step you want and I will proceed.
