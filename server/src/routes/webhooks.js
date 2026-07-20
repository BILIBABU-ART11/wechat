const express = require('express');
const store = require('../services/mockStore');
const subscriptionService = require('../services/subscriptionService');
const router = express.Router();

router.post('/feishu-record-created', async (req, res, next) => {
  try {
    const result = store.createMessageFromFeishuRecord(req.body);
    await subscriptionService.sendSubscribeMessage({
      event: 'feishu-record-created',
      record: req.body
    });
    res.json({ code: 0, message: 'ok', data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
