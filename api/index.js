const serverless = require('serverless-http');
const app = require('../server');

// Export multiple handler forms to improve compatibility with Vercel and other hosts.
const handler = serverless(app);
module.exports = handler;
module.exports.handler = handler;
module.exports.default = handler;

// Also export a plain Express-style handler (some platforms call the file directly)
module.exports.raw = (req, res) => app(req, res);
