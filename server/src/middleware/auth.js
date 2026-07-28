const authService = require('../services/authService');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ code: 401, message: 'missing authorization token', data: null });
    return;
  }
  try {
    const user = await authService.resolveUserByToken(token);
    if (!user) {
      res.status(401).json({ code: 401, message: 'invalid or expired token', data: null });
      return;
    }
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate };
