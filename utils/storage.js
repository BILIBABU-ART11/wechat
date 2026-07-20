const {
  TOKEN_KEY,
  USER_KEY,
  SUBSCRIBE_STATE_KEY
} = require('./constants');

function getStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === '' || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function setStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    console.warn('setStorage failed', key, error);
  }
}

function removeStorage(key) {
  try {
    wx.removeStorageSync(key);
  } catch (error) {
    console.warn('removeStorage failed', key, error);
  }
}

function getToken() {
  return getStorage(TOKEN_KEY, '');
}

function setToken(token) {
  setStorage(TOKEN_KEY, token);
}

function getUser() {
  return getStorage(USER_KEY, null);
}

function setUser(user) {
  setStorage(USER_KEY, user);
}

function clearAll() {
  removeStorage(TOKEN_KEY);
  removeStorage(USER_KEY);
}

function getSubscribeState() {
  return getStorage(SUBSCRIBE_STATE_KEY, {
    enabled: false,
    mock: true,
    updated_at: ''
  });
}

function setSubscribeState(state) {
  setStorage(SUBSCRIBE_STATE_KEY, state);
}

module.exports = {
  getStorage,
  setStorage,
  removeStorage,
  getToken,
  setToken,
  getUser,
  setUser,
  clearAll,
  getSubscribeState,
  setSubscribeState
};
