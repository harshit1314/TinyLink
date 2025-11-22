const app = require('../server');

// Export the raw Express app as the function handler so Vercel invokes the
// app with the original incoming URL preserved. This avoids serverless-http
// path-wrapping issues where API routes could be rewritten to '/'.
module.exports = (req, res) => app(req, res);
module.exports.handler = (req, res) => app(req, res);
module.exports.default = (req, res) => app(req, res);

// Also expose a small JSON endpoint when called as a module function
module.exports.get = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({ ok: true, note: '/api/links handler present (raw)' }));
};
