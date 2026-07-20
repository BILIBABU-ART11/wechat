const express = require('express');
const { authenticate } = require('../middleware/auth');
const config = require('../config');
const store = require('../services/mockStore');
const todoStatService = require('../services/todoStatService');
const router = express.Router();

router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const data = config.mockMode ? store.getSummary() : await todoStatService.getSummary(req.user.internal_account);
    res.json({ code: 0, message: 'ok', data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
