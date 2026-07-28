const request = require('./request');
const storage = require('../utils/storage');

function wxLogin() {
  if (typeof wx === 'undefined' || !wx.login) {
    return Promise.resolve('mock-js-runtime-code');
  }
  return new Promise((resolve, reject) => {
    wx.login({
      timeout: 5000,
      success(result) {
        if (result.code) {
          resolve(result.code);
          return;
        }
        reject(new Error('微信登录未返回 code'));
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || '微信登录失败'));
      }
    });
  });
}

function persistSession(result) {
  if (result && result.token) storage.setToken(result.token);
  if (result && result.user) storage.setUser(result.user);
  if (result && result.bind_token) storage.setBindToken(result.bind_token);
}

function login() {
  return wxLogin()
    .then((code) => request.post('/api/auth/wechat-login', { code }, { showLoading: true }))
    .then((result) => {
      persistSession(result);
      return result;
    });
}

function bindAccount(payload) {
  return request.post('/api/auth/bind', Object.assign({}, payload, {
    bind_token: payload.bind_token || storage.getBindToken()
  }), { showLoading: true })
    .then((result) => {
      persistSession(result);
      storage.setBindToken('');
      return result;
    });
}

function logout() {
  storage.clearAll();
  return Promise.resolve();
}

function getCurrentUser() {
  return storage.getUser();
}

function checkLogin() {
  return Boolean(storage.getToken() && storage.getUser());
}

module.exports = {
  login,
  bindAccount,
  logout,
  getCurrentUser,
  checkLogin
};
