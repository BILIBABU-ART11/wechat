const config = require('../config');

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function getTemplateIds() {
  return config.subscribeTemplateIds.length
    ? config.subscribeTemplateIds
    : [config.wechat.subscribeTemplateId].filter(Boolean);
}

function assertWechatConfigured() {
  if (typeof fetch !== 'function') {
    const error = new Error('Current Node.js runtime does not support fetch.');
    error.status = 500;
    throw error;
  }
  if (!config.wechat.appId || !config.wechat.appSecret || !config.wechat.subscribeTemplateId) {
    const error = new Error('WeChat subscription message credentials or template ID are not configured.');
    error.status = 500;
    throw error;
  }
}

async function getAccessToken() {
  assertWechatConfigured();
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt) {
    return cachedAccessToken;
  }
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', config.wechat.appId);
  url.searchParams.set('secret', config.wechat.appSecret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.todoApi.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json();
    if (!response.ok || payload.errcode) {
      throw new Error(payload.errmsg || `Failed to get WeChat access_token: ${response.status}`);
    }
    cachedAccessToken = payload.access_token;
    cachedAccessTokenExpiresAt = Date.now() + Math.max(0, Number(payload.expires_in || 7200) - 300) * 1000;
    return cachedAccessToken;
  } finally {
    clearTimeout(timeout);
  }
}

function trimValue(value, maxLength) {
  const text = String(value || '');
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function buildMessageData(payload) {
  return {
    thing1: { value: trimValue(payload.userName || '待办提醒', 20) },
    number2: { value: String(Number(payload.pendingCount || 0)) },
    thing3: { value: trimValue(payload.content || '您有待办事项需要处理', 20) },
    date4: { value: payload.snapshotDate || new Date().toISOString().slice(0, 10) }
  };
}

async function sendSubscribeMessage(payload) {
  const templateId = payload.template_id || config.wechat.subscribeTemplateId || getTemplateIds()[0];
  if (config.mockMode || payload.mock) {
    return {
      sent: true,
      mock: true,
      reason: 'Mock subscription message send succeeded locally.',
      payload
    };
  }
  if (!templateId) {
    return {
      sent: false,
      mock: false,
      reason: 'No WeChat subscription template ID configured.',
      payload
    };
  }
  const accessToken = await getAccessToken();
  const url = new URL('https://api.weixin.qq.com/cgi-bin/message/subscribe/send');
  url.searchParams.set('access_token', accessToken);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.todoApi.timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: payload.openid,
        template_id: templateId,
        page: payload.page || config.wechat.templatePage,
        data: payload.data || buildMessageData(payload)
      }),
      signal: controller.signal
    });
    const result = await response.json();
    return {
      sent: response.ok && result.errcode === 0,
      mock: false,
      result,
      payload: {
        openid: payload.openid,
        template_id: templateId,
        page: payload.page || config.wechat.templatePage
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getTemplateIds,
  sendSubscribeMessage
};
