const mock = require('./mock');
const storage = require('../utils/storage');
const {
  MOCK_ENABLED,
  REQUEST_MODE,
  ENABLE_MOCK_FALLBACK,
  API_BASE_URL
} = require('../utils/constants');

function showError(message) {
  if (typeof wx !== 'undefined' && wx.showToast) {
    wx.showToast({ title: message || '请求失败', icon: 'none' });
  }
}

function handleEnvelope(envelope) {
  if (envelope && envelope.code === 0) return envelope.data;
  const error = new Error((envelope && envelope.message) || '请求失败');
  error.code = envelope && envelope.code;
  error.errorCode = envelope && envelope.error_code;
  error.responseData = envelope && envelope.data;
  throw error;
}

function normalizeHttpErrorMessage(statusCode, body) {
  const message = body && typeof body === 'object' ? body.message : '';
  const errorCode = body && typeof body === 'object' ? body.error_code : '';
  if (errorCode === 'LOGIN_CONFIG_MISSING' || String(message).includes('WECHAT_APP_ID')) {
    return '后端微信登录配置缺失，请联系管理员';
  }
  if (errorCode === 'WECHAT_CODE2SESSION_FAILED') {
    return '微信登录校验失败，请确认小程序配置';
  }
  if (statusCode === 500) return '服务内部异常，请联系管理员';
  if (statusCode === 502) return '上游服务调用失败，请稍后重试';
  if (statusCode === 503) return '服务暂不可用，请稍后重试';
  return message || `服务异常 ${statusCode}`;
}

function createHttpError(response) {
  const body = response.data && typeof response.data === 'object' ? response.data : {};
  const error = new Error(normalizeHttpErrorMessage(response.statusCode, body));
  error.statusCode = response.statusCode;
  error.code = body.code;
  error.errorCode = body.error_code;
  error.responseData = body.data;
  return error;
}

function redirectLogin() {
  storage.clearAll();
  if (typeof wx !== 'undefined' && wx.reLaunch) {
    wx.reLaunch({ url: '/pages/login/login' });
  }
}

function shouldUseFrontendMock() {
  return MOCK_ENABLED || REQUEST_MODE === 'frontend-mock';
}

function requestMock(config) {
  return mock.request(config).then(handleEnvelope);
}

function requestBackend(config) {
  if (typeof wx === 'undefined' || !wx.request) {
    return Promise.reject(new Error('当前运行环境不支持 wx.request'));
  }
  return new Promise((resolve, reject) => {
    const token = storage.getToken();
    wx.request({
      url: `${API_BASE_URL}${config.url}`,
      method: config.method,
      data: config.data,
      header: Object.assign({
        'content-type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache'
      }, token ? { Authorization: `Bearer ${token}` } : {}),
      success(response) {
        if (response.statusCode === 401) {
          const error = new Error('登录已过期，请重新登录');
          error.noFallback = true;
          redirectLogin();
          reject(error);
          return;
        }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(handleEnvelope(response.data));
          } catch (error) {
            reject(error);
          }
          return;
        }
        reject(createHttpError(response));
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || '网络请求失败'));
      }
    });
  });
}

function request(options) {
  const config = Object.assign({ method: 'GET', data: {}, showLoading: false, showError: true }, options || {});
  if (config.showLoading && typeof wx !== 'undefined' && wx.showLoading) {
    wx.showLoading({ title: '加载中', mask: true });
  }
  const runner = shouldUseFrontendMock()
    ? requestMock(config)
    : requestBackend(config).catch((error) => {
      if (ENABLE_MOCK_FALLBACK && !error.noFallback) {
        console.warn('Backend request failed, falling back to frontend mock:', config.url, error);
        return requestMock(config);
      }
      throw error;
    });
  return runner
    .catch((error) => {
      if (config.showError !== false) {
        showError(error.message || '请求失败');
        error.toastShown = true;
      }
      throw error;
    })
    .finally(() => {
      if (config.showLoading && typeof wx !== 'undefined' && wx.hideLoading) {
        wx.hideLoading();
      }
    });
}

function get(url, data, options) {
  return request(Object.assign({}, options, { url, data, method: 'GET' }));
}

function post(url, data, options) {
  return request(Object.assign({}, options, { url, data, method: 'POST' }));
}

function patch(url, data, options) {
  return request(Object.assign({}, options, { url, data, method: 'PATCH' }));
}

module.exports = { request, get, post, patch };
