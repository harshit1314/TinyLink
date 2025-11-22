const app = require('../server');

// Export the raw Express app as the function handler. This keeps the original
// URL and path intact when invoked by Vercel and avoids path rewriting issues.
module.exports = (req, res) => app(req, res);
module.exports.handler = (req, res) => app(req, res);
module.exports.default = (req, res) => app(req, res);
module.exports.raw = (req, res) => app(req, res);
