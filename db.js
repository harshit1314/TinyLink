const path = require('path');
const fs = require('fs');

const DB_FILE = process.env.JSON_DB_FILE || path.join(__dirname, 'data.json');

function read() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { links: [] };
  }
}

function write(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function createLink({ code, url }) {
  const data = read();
  if (data.links.find(l => l.code === code)) throw new Error('exists');
  const now = new Date().toISOString();
  data.links.push({ code, url, clicks: 0, created_at: now, last_clicked: null });
  write(data);
}

function getLink(code) {
  const data = read();
  return data.links.find(l => l.code === code) || null;
}

function listLinks() {
  const data = read();
  // sort by created_at desc
  return data.links.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
}

function incrementClick(code) {
  const data = read();
  const item = data.links.find(l => l.code === code);
  if (!item) return null;
  item.clicks = (item.clicks || 0) + 1;
  item.last_clicked = new Date().toISOString();
  write(data);
  return item;
}

function deleteLink(code) {
  const data = read();
  const before = data.links.length;
  data.links = data.links.filter(l => l.code !== code);
  write(data);
  return { changed: before - data.links.length };
}

module.exports = {
  createLink,
  getLink,
  listLinks,
  incrementClick,
  deleteLink
};
