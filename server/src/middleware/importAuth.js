const config = require('../config');

function readImportToken(req) {
  const header = req.headers.authorization || '';
  const bearer = header.replace(/^Bearer\s+/i, '').trim();
  return bearer || req.headers['x-import-token'] || '';
}

function authenticateImport(req, res, next) {
  if (!config.todoImportToken) {
    res.status(500).json({ code: 500, message: 'TODO_IMPORT_TOKEN is not configured', data: null });
    return;
  }
  if (readImportToken(req) !== config.todoImportToken) {
    res.status(401).json({ code: 401, message: 'invalid import token', data: null });
    return;
  }
  next();
}

module.exports = { authenticateImport, readImportToken };
