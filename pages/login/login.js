const auth = require('../../services/auth');

function getLoginFailureMessage(error) {
  if (error && error.errorCode === 'LOGIN_CONFIG_MISSING') {
    return '后端微信登录配置缺失，请联系管理员在云托管配置小程序 AppID 和 AppSecret。';
  }
  if (error && error.errorCode === 'WECHAT_CODE2SESSION_FAILED') {
    return '微信登录校验失败，请确认小程序 AppID 与后端配置一致。';
  }
  if (error && error.errorCode === 'WECHAT_API_UNREACHABLE') {
    return '后端无法连接微信登录服务，请联系管理员检查云托管网络。';
  }
  if (error && error.statusCode === 500) return '服务内部异常，请联系管理员查看后端日志。';
  if (error && error.statusCode === 502) return '微信登录接口暂时不可用，请稍后重试。';
  if (error && error.statusCode === 503) return '提醒服务暂不可用，请稍后重试。';
  return (error && error.message) || '登录失败';
}

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
        const message = getLoginFailureMessage(error);
        if (wx.showModal && error && error.errorCode === 'LOGIN_CONFIG_MISSING') {
          wx.showModal({ title: '登录失败', content: message, showCancel: false });
          return;
        }
        if (!error || !error.toastShown) {
          wx.showToast({ title: message, icon: 'none' });
        }
      })
      .then(() => this.setData({ loading: false }));
  }
});
