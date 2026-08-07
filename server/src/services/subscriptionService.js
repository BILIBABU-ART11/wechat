const config = require('../config');

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;
const PERMANENT_SEND_ERRORS = new Set([40037, 41030, 43101, 47003]);

function getTemplateIds() {
  return config.subscribeTemplateIds.length
    ? config.subscribeTemplateIds
    : [config.wechat.subscribeTemplateId].filter(Boolean);
}

function assertWechatConfigured() {
  if (!config.wechat.appId || !config.wechat.appSecret || !getTemplateIds().length) {
    const error = new Error('WeChat subscription message credentials or template ID are not configured.');
    error.status = 500;
    throw error;
  }
  if (!config.wechat.templateFieldsValid) {
    const error = new Error('WECHAT_SUBSCRIBE_TEMPLATE_FIELDS is invalid.');
    error.status = 500;
    throw error;
  }
}

async function getAccessToken() {
  assertWechatConfigured();
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt) return cachedAccessToken;
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

function currentReminderTime() {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: config.reminderSchedule.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}:${parts.second}`;
}

function buildMessageData(payload) {
  assertWechatConfigured();
  const fields = config.wechat.templateFields;
  if (fields.time && fields.content) {
    const content = payload.content
      || `${payload.userName || '您'}当前有${Math.max(0, Number(payload.pendingCount || 0))}条待办`;
    return {
      [fields.time]: { value: payload.reminderTime || currentReminderTime() },
      [fields.content]: { value: trimValue(content, 20) }
    };
  }
  return {
    [fields.title]: { value: trimValue(payload.userName || '待办提醒', 20) },
    [fields.count]: { value: String(Math.max(0, Number(payload.pendingCount || 0))) },
    [fields.content]: { value: trimValue(payload.content || '您有待办事项需要处理', 20) },
    [fields.date]: { value: payload.snapshotDate || new Date().toISOString().slice(0, 10) }
  };
}

function isPermanentWechatError(result) {
  return Boolean(result && PERMANENT_SEND_ERRORS.has(Number(result.errcode)));
}

async function sendSubscribeMessage(payload) {
  const templateId = payload.template_id || config.wechat.subscribeTemplateId || getTemplateIds()[0];
  if (config.mockMode || payload.mock) {
    return {
      sent: true,
      mock: true,
      permanent: false,
      reason: 'Mock subscription message send succeeded locally.',
      payload
    };
  }
  assertWechatConfigured();
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
      permanent: isPermanentWechatError(result),
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
  sendSubscribeMessage,
  buildMessageData,
  isPermanentWechatError
};
