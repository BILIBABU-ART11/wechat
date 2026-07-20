const auth = require('./services/auth');
const { REQUIRE_BIND_ON_LAUNCH } = require('./utils/constants');

App({
  globalData: {
    user: null,
    appName: '院院通'
  },

  onLaunch() {
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
