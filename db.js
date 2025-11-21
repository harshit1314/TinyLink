const path = require('path');
const fs = require('fs').promises;

const DB_FILE = process.env.JSON_DB_FILE || path.join(__dirname, 'data.json');

// If running on serverless platforms (Vercel), avoid writing to project FS.
const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.FUNCTIONS_WORKER_RUNTIME;

// In-memory fallback store (lives for cold-start lifetime)
const memory = { links: [] };

async function readFileSafe() {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { links: [] };
  }
}

async function writeFileSafe(data) {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    // cannot write (likely read-only filesystem) — fall back to memory
    return false;
  }
}

async function createLink({ code, url }) {
  const now = new Date().toISOString();
  if (IS_SERVERLESS) {
    if (memory.links.find(l => l.code === code)) throw new Error('exists');
    memory.links.push({ code, url, clicks: 0, created_at: now, last_clicked: null });
    return;
  }

  const data = await readFileSafe();
  if (data.links.find(l => l.code === code)) throw new Error('exists');
  data.links.push({ code, url, clicks: 0, created_at: now, last_clicked: null });
  const ok = await writeFileSafe(data);
  if (!ok) {
    // fallback to memory if file write failed
    memory.links = data.links;
  }
}

async function getLink(code) {
  if (IS_SERVERLESS) {
    return memory.links.find(l => l.code === code) || null;
  }
  const data = await readFileSafe();
  return data.links.find(l => l.code === code) || null;
}

async function listLinks() {
  if (IS_SERVERLESS) {
    return memory.links.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
  }
  const data = await readFileSafe();
  return data.links.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
}

async function incrementClick(code) {
  const now = new Date().toISOString();
  if (IS_SERVERLESS) {
    const item = memory.links.find(l => l.code === code);
    if (!item) return null;
    item.clicks = (item.clicks || 0) + 1;
    item.last_clicked = now;
    return item;
  }
  const data = await readFileSafe();
  const item = data.links.find(l => l.code === code);
  if (!item) return null;
  item.clicks = (item.clicks || 0) + 1;
  item.last_clicked = now;
  const ok = await writeFileSafe(data);
  if (!ok) memory.links = data.links;
  return item;
}

async function deleteLink(code) {
  if (IS_SERVERLESS) {
    const before = memory.links.length;
    memory.links = memory.links.filter(l => l.code !== code);
    return { changed: before - memory.links.length };
  }
  const data = await readFileSafe();
  const before = data.links.length;
  data.links = data.links.filter(l => l.code !== code);
  const ok = await writeFileSafe(data);
  if (!ok) memory.links = data.links;
  return { changed: before - data.links.length };
}

module.exports = {
  createLink,
  getLink,
  listLinks,
  incrementClick,
  deleteLink
};
