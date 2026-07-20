const express = require('express');
const { authenticate } = require('../middleware/auth');
const config = require('../config');
const store = require('../services/mockStore');
const feishuService = require('../services/feishuService');
const todoStatService = require('../services/todoStatService');
const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const query = Object.assign({}, req.query, { userId: req.user.internal_account });
    const data = config.mockMode ? store.listArticles(req.query) : await todoStatService.listArticles(query);
    res.json({ code: 0, message: 'ok', data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const data = config.mockMode ? store.getArticle(req.params.id) : await todoStatService.getArticle(req.params.id, req.user.internal_account);
    res.json({ code: 0, message: 'ok', data });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', authenticate, async (req, res, next) => {
  try {
    if (!config.mockMode) {
      const error = new Error('todo snapshots are read-only');
      error.status = 405;
      throw error;
    }
    const article = store.updateArticleStatus(req.params.id, req.body);
    await feishuService.updateBitableRecord(article.record_id, {
      status: article.status,
      comment: article.comment,
      updated_at: article.updated_at
    });
    res.json({ code: 0, message: 'ok', data: article });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
