const express = require('express');
const store = require('../services/mockStore');
const router = express.Router();

function sendOk(res, data) {
  res.json({ code: 0, message: 'ok', data });
}

router.post('/wechat-login', (req, res, next) => {
  try {
    sendOk(res, store.wechatLogin(req.body.code));
  } catch (error) {
    next(error);
  }
});

router.post('/bind', (req, res, next) => {
  try {
    sendOk(res, store.bindAccount(req.body));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
