const app = require('../server');

// Catch-all API route: export the raw Express app as the handler so the
// original request path (e.g., /api/links) is preserved.
module.exports = (req, res) => app(req, res);
module.exports.handler = (req, res) => app(req, res);
module.exports.default = (req, res) => app(req, res);
module.exports.raw = (req, res) => app(req, res);
