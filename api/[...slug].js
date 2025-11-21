const serverless = require('serverless-http');
const app = require('../server');

// Catch-all API route for platforms (like Vercel) that map /api/* to files under /api
const handler = serverless(app);
module.exports = handler;
module.exports.handler = handler;
module.exports.default = handler;

// Export raw express as fallback
module.exports.raw = (req, res) => app(req, res);
