const request = require('./request');
const storage = require('../utils/storage');

function wxLogin() {
  if (typeof wx === 'undefined' || !wx.login) {
    return Promise.resolve('mock-js-runtime-code');
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    const timer = setTimeout(() => {
      finish('mock-login-timeout-code');
    }, 5000);
    wx.login({
      timeout: 5000,
      success(result) {
        clearTimeout(timer);
        finish(result.code || 'mock-devtools-code');
      },
      fail() {
        clearTimeout(timer);
        finish('mock-login-fallback-code');
      }
    });
  });
}

function persistSession(result) {
  if (result && result.token) storage.setToken(result.token);
  if (result && result.user) storage.setUser(result.user);
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
  return request.post('/api/auth/bind', payload, { showLoading: true })
    .then((result) => {
      persistSession(result);
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
