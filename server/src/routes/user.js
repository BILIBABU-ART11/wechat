const express = require('express');
const { authenticate } = require('../middleware/auth');
const config = require('../config');
const accountStore = require('../services/accountStore');
const router = express.Router();

router.get('/me', authenticate, async (req, res, next) => {
  try {
    if (config.mockMode) {
      res.json({ code: 0, message: 'ok', data: req.user });
      return;
    }
    const [subscription, lastImport, lastSend] = await Promise.all([
      accountStore.getSubscription(req.user.id),
      accountStore.getLastImportRun(),
      accountStore.getLastReminderSend(req.user.id)
    ]);
    res.json({
      code: 0,
      message: 'ok',
      data: Object.assign({}, req.user, {
        subscription,
        last_import: lastImport,
        last_send: lastSend
      })
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
