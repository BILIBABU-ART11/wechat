const express = require('express');
const { authenticate } = require('../middleware/auth');
const config = require('../config');
const store = require('../services/mockStore');
const accountStore = require('../services/accountStore');
const authService = require('../services/authService');
const subscriptionService = require('../services/subscriptionService');

const router = express.Router();

router.get('/config', authenticate, (req, res) => {
  const templateIds = subscriptionService.getTemplateIds();
  res.json({
    code: 0,
    message: 'ok',
    data: {
      template_ids: templateIds,
      template_fields: config.wechat.templateFields,
      request_id: authService.issueSubscribeRequest(req.user.id, templateIds)
    }
  });
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const requestToken = String(req.body.request_id || '');
    const requestPayload = authService.verifySubscribeRequest(requestToken, req.user.id);
    const configuredIds = subscriptionService.getTemplateIds();
    const allowedIds = requestPayload.template_ids.filter((id) => configuredIds.includes(id));
    const raw = req.body.raw && typeof req.body.raw === 'object' ? req.body.raw : {};
    const acceptedTemplateIds = allowedIds.filter((id) => raw[id] === 'accept');
    const payload = {
      request_id: requestPayload.nonce,
      accepted: acceptedTemplateIds.length > 0,
      accepted_template_ids: acceptedTemplateIds,
      template_ids: allowedIds,
      raw,
      mock: config.mockMode
    };
    const data = config.mockMode
      ? store.saveSubscription(req.user.id, payload)
      : await accountStore.saveSubscription(req.user.id, payload);
    res.json({ code: 0, message: 'ok', data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
