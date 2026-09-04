const api = require('../../services/api');
const permission = require('../../utils/permission');
const storage = require('../../utils/storage');
const authGuard = require('../../utils/authGuard');

const TARGET_GRANTS = 10;

function progressFor(subscription) {
  const value = Number(subscription && subscription.remaining_count);
  const remainingCount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return {
    remainingCount,
    progressPercent: Math.min(100, Math.round((remainingCount / TARGET_GRANTS) * 100)),
    completed: remainingCount >= TARGET_GRANTS
  };
}

function applySubscription(page, subscription) {
  const state = subscription || storage.getSubscribeState();
  storage.setSubscribeState(state);
  page.setData(Object.assign({ subscribeState: state }, progressFor(state)));
}

Page({
  data: {
    targetCount: TARGET_GRANTS,
    remainingCount: 0,
    progressPercent: 0,
    completed: false,
    ready: false,
    loading: false,
    subscribeState: {
      enabled: false,
      remaining_count: 0
    }
  },

  onShow() {
    if (!authGuard.requireLogin()) return Promise.resolve();
    applySubscription(this, storage.getSubscribeState());
    this.setData({ ready: false });
    return Promise.all([
      api.getCurrentUser(),
      api.getSubscribeConfig()
    ])
      .then(([user, subscribeConfig]) => {
        const subscription = user.subscription || storage.getSubscribeState();
        storage.setUser(user);
        getApp().globalData.user = user;
        this._subscribeConfig = subscribeConfig;
        applySubscription(this, subscription);
        this.setData({ ready: true });
      })
      .catch((error) => {
        this._subscribeConfig = null;
        this.setData({ ready: false });
        wx.showToast({ title: error.message || '订阅配置加载失败', icon: 'none' });
      });
  },

  loadNextConfig() {
    return api.getSubscribeConfig()
      .then((subscribeConfig) => {
        this._subscribeConfig = subscribeConfig;
        this.setData({ ready: true });
      })
      .catch(() => {
        this._subscribeConfig = null;
        this.setData({ ready: false });
      });
  },

  grantOne() {
    if (this.data.loading || this.data.completed) return Promise.resolve();
    const subscribeConfig = this._subscribeConfig;
    if (!subscribeConfig) {
      wx.showToast({ title: '授权准备中，请稍后再试', icon: 'none' });
      return this.loadNextConfig();
    }

    this._subscribeConfig = null;
    this.setData({ loading: true, ready: false });
    return permission.requestReminderSubscribe(subscribeConfig)
      .then((result) => {
        if (result.error) throw new Error(result.error);
        return api.subscribeReminder(result);
      })
      .then((state) => {
        const before = this.data.remainingCount;
        applySubscription(this, state);
        wx.showToast({
          title: this.data.remainingCount > before ? '已储备 1 次' : '未新增提醒次数',
          icon: 'none'
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '授权失败', icon: 'none' });
      })
      .then(() => this.loadNextConfig())
      .then(() => {
        this.setData({ loading: false });
      });
  },

  finish() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  skip() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});

module.exports = {
  TARGET_GRANTS,
  progressFor
};