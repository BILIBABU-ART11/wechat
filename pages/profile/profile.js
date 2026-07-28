const auth = require('../../services/auth');
const api = require('../../services/api');
const permission = require('../../utils/permission');
const storage = require('../../utils/storage');
const authGuard = require('../../utils/authGuard');
const { ROLE_LABELS } = require('../../utils/constants');

function formatStatusText(status) {
  if (!status) return '暂无记录';
  return status === 'success' ? '成功' : '失败';
}

Page({
  data: {
    user: {},
    avatarText: '院',
    roleName: '',
    subscribeState: {
      enabled: false,
      remaining_count: 0,
      updated_at: ''
    },
    lastImportText: '暂无记录',
    lastSendText: '暂无记录'
  },

  onShow() {
    if (!authGuard.requireLogin()) return;
    const user = auth.getCurrentUser() || {};
    this.setData({
      user,
      avatarText: user.nickname ? user.nickname.slice(0, 1) : '院',
      roleName: user ? (ROLE_LABELS[user.role] || user.role_name || user.role) : '',
      subscribeState: storage.getSubscribeState()
    });
    this.refreshRemoteState();
  },

  refreshRemoteState() {
    api.getCurrentUser()
      .then((user) => {
        if (user.subscription) storage.setSubscribeState(user.subscription);
        storage.setUser(user);
        getApp().globalData.user = user;
        this.setData({
          user,
          avatarText: user.nickname ? user.nickname.slice(0, 1) : '院',
          roleName: ROLE_LABELS[user.role] || user.role_name || user.role || '',
          subscribeState: user.subscription || storage.getSubscribeState(),
          lastImportText: user.last_import
            ? `${formatStatusText(user.last_import.status)} ${user.last_import.finished_at || ''}`
            : '暂无记录',
          lastSendText: user.last_send
            ? `${user.last_send.sent ? '已发送' : '未发送'} ${user.last_send.created_at || ''}`
            : '暂无记录'
        });
      })
      .catch(() => {});
  },

  subscribeReminder() {
    if (!authGuard.requireLogin()) return;
    api.getSubscribeConfig()
      .then((config) => permission.requestReminderSubscribe(config.template_ids || []))
      .then((result) => api.subscribeReminder(result))
      .then((state) => {
        storage.setSubscribeState(state);
        this.setData({ subscribeState: state });
        wx.showToast({ title: state.enabled ? '订阅已开启' : '订阅未开启', icon: 'none' });
        this.refreshRemoteState();
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '订阅失败', icon: 'none' });
      });
  },

  logout() {
    auth.logout().then(() => wx.reLaunch({ url: '/pages/login/login' }));
  }
});
