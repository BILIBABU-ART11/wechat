const express = require('express');
const authService = require('../services/authService');
const router = express.Router();

function sendOk(res, data) {
  res.json({ code: 0, message: 'ok', data });
}

router.post('/wechat-login', async (req, res, next) => {
  try {
    sendOk(res, await authService.wechatLogin(req.body.code));
  } catch (error) {
    next(error);
  }
});

router.post('/bind', async (req, res, next) => {
  try {
    sendOk(res, await authService.bindAccount(req.body || {}));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
