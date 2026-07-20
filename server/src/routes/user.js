const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/me', authenticate, (req, res) => {
  res.json({ code: 0, message: 'ok', data: req.user });
});

module.exports = router;
