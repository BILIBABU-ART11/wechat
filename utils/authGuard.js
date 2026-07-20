const auth = require('../services/auth');

function requireLogin() {
  if (auth.checkLogin()) return true;
  if (typeof wx !== 'undefined' && wx.reLaunch) {
    wx.reLaunch({
      url: '/pages/login/login'
    });
  }
  return false;
}

module.exports = {
  requireLogin
};
