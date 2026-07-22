const express = require('express');
const { authenticate } = require('../middleware/auth');
const config = require('../config');
const store = require('../services/mockStore');
const todoStatService = require('../services/todoStatService');
const reminderJobService = require('../services/reminderJobService');

const router = express.Router();

function mockSnapshots(query) {
  const list = store.listArticles(query);
  return {
    items: list.items.map((article) => ({
      id: article.id,
      snapshotDate: (article.updated_at || article.publish_time || '').slice(0, 10),
      userId: article.owner || article.id,
      userName: article.owner || article.company,
      pendingCount: article.ai_score,
      content: article.reminder_reason || article.ai_summary
    })),
    total: list.total,
    page: list.page,
    pageSize: list.page_size
  };
}

router.get('/snapshots', authenticate, async (req, res, next) => {
  try {
    const query = Object.assign({}, req.query, { userId: req.user.internal_account });
    const data = config.mockMode ? mockSnapshots(req.query) : await todoStatService.listSnapshots(query);
    res.json({ code: 0, message: 'ok', data });
  } catch (error) {
    next(error);
  }
});

function readImportToken(req) {
  const header = req.headers.authorization || '';
  const bearer = header.replace(/^Bearer\s+/i, '').trim();
  return bearer || req.headers['x-import-token'] || '';
}

router.post('/import', async (req, res, next) => {
  try {
    if (!config.todoImportToken) {
      res.status(500).json({ code: 500, message: 'TODO_IMPORT_TOKEN is not configured', data: null });
      return;
    }
    if (readImportToken(req) !== config.todoImportToken) {
      res.status(401).json({ code: 401, message: 'invalid import token', data: null });
      return;
    }
    const importResult = await todoStatService.importSnapshots(req.body || {});
    let reminderResult = null;
    if (req.body && req.body.trigger_reminders) {
      reminderResult = await reminderJobService.runReminderJob('import');
    }
    res.json({
      code: 0,
      message: 'ok',
      data: {
        imported: importResult,
        reminder_result: reminderResult
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
