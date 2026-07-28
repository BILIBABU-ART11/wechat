const crypto = require('crypto');
const config = require('../config');
const mockStore = require('./mockStore');
const accountStore = require('./accountStore');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', config.tokenSecret).update(value).digest('base64url');
}

function issueToken(type, payload, ttlMs) {
  if (!config.mockMode && (!config.tokenSecret || config.tokenSecret === 'mock-secret')) {
    throw createHttpError(500, 'APP_TOKEN_SECRET must be configured for production.');
  }
  const body = base64url(Object.assign({}, payload, {
    type,
    iat: Date.now(),
    exp: Date.now() + ttlMs
  }));
  return `${body}.${sign(body)}`;
}

function verifyToken(token, expectedType) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature || sign(body) !== signature) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
  if (expectedType && payload.type !== expectedType) return null;
  if (Number(payload.exp || 0) < Date.now()) return null;
  return payload;
}

async function code2Session(code) {
  if (!code) throw createHttpError(422, 'missing wx.login code');
  if (!config.wechat.appId || !config.wechat.appSecret) {
    throw createHttpError(500, 'WECHAT_APP_ID and WECHAT_APP_SECRET must be configured.');
  }
  if (typeof fetch !== 'function') {
    throw createHttpError(500, 'Current Node.js runtime does not support fetch.');
  }
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', config.wechat.appId);
  url.searchParams.set('secret', config.wechat.appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.todoApi.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json();
    if (!response.ok || payload.errcode || !payload.openid) {
      throw createHttpError(502, payload.errmsg || 'WeChat code2Session failed.');
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function accessTokenForUser(user) {
  return issueToken('access', {
    user_id: user.id,
    openid: user.openid,
    internal_account: user.internal_account
  }, 30 * 24 * 60 * 60 * 1000);
}

async function wechatLogin(code) {
  if (config.mockMode) return mockStore.wechatLogin(code);
  const session = await code2Session(code);
  const user = await accountStore.findUserByOpenid(session.openid);
  if (!user || !user.bound) {
    return {
      token: '',
      need_bind: true,
      bind_token: issueToken('bind', { openid: session.openid }, 10 * 60 * 1000),
      user: null
    };
  }
  return {
    token: accessTokenForUser(user),
    need_bind: false,
    user
  };
}

async function bindAccount(payload) {
  if (config.mockMode) return mockStore.bindAccount(payload);
  const bindValue = String(payload.bind_value || '').trim();
  if (payload.bind_type !== 'user_id' || !/^\d{6,}$/.test(bindValue)) {
    throw createHttpError(422, '只能使用有效用户ID授权码绑定');
  }
  const bindPayload = verifyToken(payload.bind_token, 'bind');
  if (!bindPayload || !bindPayload.openid) {
    throw createHttpError(401, '绑定会话已失效，请重新微信登录');
  }
  const user = await accountStore.bindUser(bindPayload.openid, bindValue);
  return {
    token: accessTokenForUser(user),
    user
  };
}

async function resolveUserByToken(token) {
  if (config.mockMode) return mockStore.resolveUserByToken(token);
  const payload = verifyToken(token, 'access');
  if (!payload || !payload.user_id) return null;
  const user = await accountStore.findUserById(payload.user_id);
  if (user) return user;
  if (!payload.internal_account || !payload.openid) return null;
  return accountStore.bindUser(payload.openid, payload.internal_account);
}

module.exports = {
  wechatLogin,
  bindAccount,
  resolveUserByToken
};
