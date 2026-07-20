const auth = require('../../services/auth');

Page({
  data: {
    loading: false
  },

  onLoad() {
    if (auth.checkLogin()) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  handleLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    auth.login()
      .then((result) => {
        if (result.need_bind) {
          wx.redirectTo({ url: '/pages/bind/bind' });
          return;
        }
        getApp().globalData.user = result.user;
        wx.switchTab({ url: '/pages/index/index' });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '登录失败', icon: 'none' });
      })
      .then(() => this.setData({ loading: false }));
  }
});
