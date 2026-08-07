const crypto = require('crypto');
const config = require('../config');
const mockStore = require('./mockStore');
const accountStore = require('./accountStore');

function createHttpError(status, message, errorCode, details) {
  const error = new Error(message);
  error.status = status;
  if (errorCode) error.errorCode = errorCode;
  if (details) error.details = details;
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

function signaturesMatch(body, signature) {
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(String(signature || ''));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function verifyToken(token, expectedType) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature || !signaturesMatch(body, signature)) return null;
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
  const loginReadiness = config.wechatLoginReadiness();
  if (!loginReadiness.ready) {
    throw createHttpError(
      503,
      '微信登录配置缺失，请在服务端环境变量配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET。',
      'LOGIN_CONFIG_MISSING',
      { missing: loginReadiness.reasons }
    );
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
      throw createHttpError(
        502,
        payload.errmsg || '微信登录校验失败，请确认小程序 AppID 与后端配置一致。',
        'WECHAT_CODE2SESSION_FAILED',
        { wechat_errcode: payload.errcode || null }
      );
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw createHttpError(504, 'WeChat login request timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function accessTokenForUser(user) {
  return issueToken('access', { user_id: user.id }, 30 * 24 * 60 * 60 * 1000);
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
  return { token: accessTokenForUser(user), user };
}

async function resolveUserByToken(token) {
  if (config.mockMode) return mockStore.resolveUserByToken(token);
  const payload = verifyToken(token, 'access');
  if (!payload || !payload.user_id) return null;
  return accountStore.findUserById(payload.user_id);
}

function issueSubscribeRequest(userId, templateIds) {
  return issueToken('subscribe', {
    user_id: userId,
    template_ids: templateIds,
    nonce: crypto.randomUUID()
  }, 10 * 60 * 1000);
}

function verifySubscribeRequest(token, userId) {
  const payload = verifyToken(token, 'subscribe');
  if (!payload || payload.user_id !== userId || !payload.nonce) {
    throw createHttpError(401, '订阅请求已失效，请重新发起订阅');
  }
  return payload;
}

module.exports = {
  wechatLogin,
  bindAccount,
  resolveUserByToken,
  issueSubscribeRequest,
  verifySubscribeRequest,
  issueToken,
  verifyToken,
  accessTokenForUser
};
