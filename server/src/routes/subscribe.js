const express = require('express');
const { authenticate } = require('../middleware/auth');
const config = require('../config');
const store = require('../services/mockStore');
const accountStore = require('../services/accountStore');
const subscriptionService = require('../services/subscriptionService');
const router = express.Router();

router.get('/config', authenticate, (req, res) => {
  res.json({
    code: 0,
    message: 'ok',
    data: {
      template_ids: subscriptionService.getTemplateIds()
    }
  });
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const requestTemplateIds = Array.isArray(req.body.template_ids) ? req.body.template_ids : [];
    const payload = Object.assign({}, req.body, {
      template_ids: requestTemplateIds.length ? requestTemplateIds : subscriptionService.getTemplateIds()
    });
    if (config.mockMode) {
      res.json({ code: 0, message: 'ok', data: store.saveSubscription(req.user.id, payload) });
      return;
    }
    res.json({ code: 0, message: 'ok', data: await accountStore.saveSubscription(req.user.id, payload) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
