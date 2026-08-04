const { SUBSCRIBE_TEMPLATE_IDS } = require('./constants');

function requestReminderSubscribe(config) {
  const options = config && !Array.isArray(config) ? config : {};
  const templateIds = Array.isArray(config)
    ? config
    : (options.template_ids || SUBSCRIBE_TEMPLATE_IDS);
  const requestId = options.request_id || '';

  if (!templateIds.length || !requestId || typeof wx === 'undefined' || !wx.requestSubscribeMessage) {
    return Promise.resolve({
      request_id: requestId,
      raw: {},
      reason: 'subscription_config_incomplete'
    });
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success(result) {
        resolve({ request_id: requestId, raw: result });
      },
      fail(error) {
        resolve({
          request_id: requestId,
          raw: {},
          error: error && error.errMsg ? error.errMsg : 'requestSubscribeMessage failed'
        });
      }
    });
  });
}

module.exports = { requestReminderSubscribe };
