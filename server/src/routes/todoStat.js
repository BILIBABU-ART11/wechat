const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authenticateImport } = require('../middleware/importAuth');
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

router.post('/import', authenticateImport, async (req, res, next) => {
  try {
    const payload = req.body || {};
    const batchId = String(payload.batch_id || '').trim();
    if (!batchId || payload.data || payload.items) {
      const error = new Error('Only a small batch trigger with batch_id is accepted.');
      error.status = 422;
      throw error;
    }
    const importResult = await todoStatService.getCurrentImportedBatch(batchId);
    const reminderResult = payload.trigger_reminders
      ? await reminderJobService.processReminderBatch(batchId, 'import')
      : null;
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
