const express = require('express');
const { authenticate } = require('../middleware/auth');
const reminderJobService = require('../services/reminderJobService');

const router = express.Router();

router.get('/status', authenticate, async (req, res, next) => {
  try {
    res.json({ code: 0, message: 'ok', data: await reminderJobService.getStatus(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/run', authenticate, async (req, res, next) => {
  try {
    const data = await reminderJobService.runReminderJob('manual');
    res.json({ code: 0, message: 'ok', data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
