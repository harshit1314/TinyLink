const serverless = require('serverless-http');
const app = require('../server');

// Explicit handler for /api/links to ensure platform routing targets this path
const handler = serverless(app);
module.exports = handler;
module.exports.handler = handler;
module.exports.default = handler;

// Also provide a minimal JSON response if called directly (helps debugging)
module.exports.get = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({ ok: true, note: '/api/links handler present' }));
};
