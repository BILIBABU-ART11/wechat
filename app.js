const auth = require('./services/auth');
const {
  CLOUD_ENV_ID,
  REQUIRE_BIND_ON_LAUNCH
} = require('./utils/constants');

App({
  globalData: {
    user: null,
    appName: '院院通'
  },

  onLaunch() {
    if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.init) {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true
      });
    } else {
      console.error('WeChat cloud capability is unavailable');
    }

    if (REQUIRE_BIND_ON_LAUNCH) {
      auth.logout();
      return;
    }
    const user = auth.getCurrentUser();
    if (user) {
      this.globalData.user = user;
    }
  }
});
