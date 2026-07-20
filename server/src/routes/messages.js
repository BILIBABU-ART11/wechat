const express = require('express');
const { authenticate } = require('../middleware/auth');
const config = require('../config');
const store = require('../services/mockStore');
const todoStatService = require('../services/todoStatService');
const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    let data;
    if (config.mockMode) {
      data = store.listMessages();
    } else {
      data = store.listTodoReminderMessages(req.user.internal_account);
      if (!data.items.length) {
        data = await todoStatService.listMessages(Object.assign({}, req.query, { userId: req.user.internal_account }));
      }
    }
    res.json({ code: 0, message: 'ok', data });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', authenticate, (req, res, next) => {
  try {
    if (!config.mockMode) {
      try {
        const data = store.markMessageRead(req.params.id);
        res.json({ code: 0, message: 'ok', data });
        return;
      } catch (error) {
        // Real-mode live API reminders are derived from snapshots and are not persisted yet.
      }
      res.json({
        code: 0,
        message: 'ok',
        data: {
          id: req.params.id,
          read: true,
          updated_at: new Date().toISOString()
        }
      });
      return;
    }
    res.json({ code: 0, message: 'ok', data: store.markMessageRead(req.params.id) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
