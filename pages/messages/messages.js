const api = require('../../services/api');
const authGuard = require('../../utils/authGuard');

Page({
  data: {
    loading: true,
    messages: [],
    unreadCount: 0
  },

  onShow() {
    if (!authGuard.requireLogin()) return;
    this.loadMessages();
  },

  onPullDownRefresh() {
    if (!authGuard.requireLogin()) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadMessages()
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh());
  },

  loadMessages() {
    this.setData({ loading: true });
    return api.getMessages()
      .then((result) => {
        this.setData({
          messages: result.items || [],
          unreadCount: result.unread_count || 0
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '提醒加载失败', icon: 'none' });
      })
      .then(() => this.setData({ loading: false }));
  },

  openMessage(event) {
    if (!authGuard.requireLogin()) return;
    const id = event.currentTarget.dataset.id;
    const articleId = event.currentTarget.dataset.articleId;
    api.markMessageRead(id)
      .then(() => this.loadMessages())
      .then(() => {
        if (articleId) wx.navigateTo({ url: `/pages/detail/detail?id=${articleId}` });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '操作失败', icon: 'none' });
      });
  }
});
