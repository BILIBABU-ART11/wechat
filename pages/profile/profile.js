const auth = require('../../services/auth');
const api = require('../../services/api');
const permission = require('../../utils/permission');
const storage = require('../../utils/storage');
const authGuard = require('../../utils/authGuard');
const { ROLE_LABELS } = require('../../utils/constants');

Page({
  data: {
    user: {},
    avatarText: 'N',
    roleName: '',
    subscribeState: {
      enabled: false,
      mock: true,
      updated_at: ''
    }
  },

  onShow() {
    if (!authGuard.requireLogin()) return;
    const user = auth.getCurrentUser() || {};
    this.setData({
      user,
      avatarText: user.nickname ? user.nickname.slice(0, 1) : 'N',
      roleName: user ? (ROLE_LABELS[user.role] || user.role_name || user.role) : '',
      subscribeState: storage.getSubscribeState()
    });
  },

  subscribeReminder() {
    if (!authGuard.requireLogin()) return;
    api.getSubscribeConfig()
      .then((config) => permission.requestReminderSubscribe(config.template_ids || []))
      .then((result) => api.subscribeReminder(result))
      .then((state) => {
        storage.setSubscribeState(state);
        this.setData({ subscribeState: state });
        wx.showToast({ title: state.enabled ? '已开启提醒' : '订阅未开启', icon: 'none' });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '订阅失败', icon: 'none' });
      });
  },

  logout() {
    auth.logout().then(() => wx.reLaunch({ url: '/pages/login/login' }));
  }
});
