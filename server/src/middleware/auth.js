const store = require('../services/mockStore');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ code: 401, message: 'missing authorization token', data: null });
    return;
  }
  const user = store.resolveUserByToken(token);
  if (!user) {
    res.status(401).json({ code: 401, message: 'invalid or expired token', data: null });
    return;
  }
  req.user = user;
  req.token = token;
  next();
}

module.exports = { authenticate };
