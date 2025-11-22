require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const crypto = require('crypto');
const { URL } = require('url');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Lightweight request logger to help debugging on serverless hosts (Vercel logs)
app.use((req, res, next) => {
  try {
    const id = (Math.random().toString(36).slice(2, 9));
    console.log(`[REQ ${id}] ${req.method} ${req.originalUrl} Host:${req.headers.host}`);
    // Also log when an /api request starts and ends
    if (req.originalUrl.startsWith('/api')) {
      const start = Date.now();
      res.on('finish', () => {
        console.log(`[REQ ${id}] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now()-start}ms`);
      });
    }
  } catch (e) {
    // ignore logging errors
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

function validateCode(code) {
  return /^[A-Za-z0-9]{6,8}$/.test(code);
}

function validateUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function generateCode(len = 6) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

// Health
app.get('/healthz', (req, res) => {
  res.json({ ok: true, version: '1.0' });
});

// API: Create link
app.post('/api/links', async (req, res) => {
  const { url, code } = req.body || {};
  if (!url || !validateUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  let useCode = code && String(code).trim();
  try {
    if (useCode) {
      if (!validateCode(useCode)) return res.status(400).json({ error: 'Code must match [A-Za-z0-9]{6,8}' });
      const exists = await db.getLink(useCode);
      if (exists) return res.status(409).json({ error: 'Code already exists' });
    } else {
      // generate
      for (let i = 0; i < 10; i++) {
        const gen = generateCode(6);
        const exists = await db.getLink(gen);
        if (!exists) { useCode = gen; break; }
      }
      if (!useCode) return res.status(500).json({ error: 'Unable to generate unique code' });
    }

    await db.createLink({ code: useCode, url });
    const base = process.env.BASE_URL || (`http://localhost:${PORT}`);
    res.status(201).json({ code: useCode, shortUrl: `${base}/${useCode}`, url });
  } catch (e) {
    console.error(e);
    if (e && e.message && e.message.includes('exists')) return res.status(409).json({ error: 'Code already exists' });
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// List links
app.get('/api/links', async (req, res) => {
  const rows = await db.listLinks();
  res.json(rows);
});

// Stats for a single code
app.get('/api/links/:code', async (req, res) => {
  const code = req.params.code;
  const row = await db.getLink(code);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// Serve stats page (frontend) for /code/:code
app.get('/code/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'code.html'));
});

// Delete link
app.delete('/api/links/:code', async (req, res) => {
  const code = req.params.code;
  try {
    // Attempt to delete via DB abstraction. The abstraction will try Postgres
    // first (if configured) and fall back to the local memory store. It
    // returns an object with a `changed` count indicating how many rows were
    // removed.
    const result = await db.deleteLink(code);
    const changed = result && (typeof result.changed === 'number' ? result.changed : (result.rowCount || 0));
    if (changed && changed > 0) {
      console.log(`[DEL] deleted code=${code} changed=${changed}`);
      return res.json({ ok: true });
    }
    console.log(`[DEL] delete attempt for code=${code} - not found (result=${JSON.stringify(result)})`);
    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('[DEL] error deleting code=', code, e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to delete' });
  }
});

// Redirect route (must be after api and static)
app.get('/:code', async (req, res) => {
  const code = req.params.code;
  // exclude paths like api, healthz, code, etc. If it's one of our routes, pass through
  if (['api', 'healthz', 'code'].includes(code)) return res.status(404).json({ error: 'Not found' });
  const row = await db.getLink(code);
  if (!row) return res.status(404).send('Not found');
  await db.incrementClick(code);
  return res.redirect(302, row.url);
});

// Only start listening when not running on a serverless platform (e.g., Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`TinyLink running on port ${PORT}`);
  });
}

module.exports = app;
