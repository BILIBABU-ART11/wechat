const { SUBSCRIBE_TEMPLATE_IDS } = require('./constants');

function requestReminderSubscribe(tmplIds) {
  const templateIds = tmplIds || SUBSCRIBE_TEMPLATE_IDS;
  if (!templateIds.length || typeof wx === 'undefined' || !wx.requestSubscribeMessage) {
    return Promise.resolve({
      accepted: false,
      mock: false,
      template_ids: templateIds,
      reason: 'no_template_ids'
    });
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success(result) {
        resolve({
          accepted: templateIds.some((id) => result[id] === 'accept'),
          mock: false,
          template_ids: templateIds,
          raw: result
        });
      },
      fail(error) {
        resolve({
          accepted: false,
          mock: false,
          template_ids: templateIds,
          error
        });
      }
    });
  });
}

module.exports = {
  requestReminderSubscribe
};
