const api = require('../../services/api');
const authGuard = require('../../utils/authGuard');

Page({
  data: {
    loading: true,
    reminders: []
  },

  onShow() {
    if (!authGuard.requireLogin()) return;
    this.loadReminders();
  },

  loadReminders() {
    this.setData({ loading: true });
    api.getArticles({
      category: '全部',
      score: 'all',
      page: 1,
      page_size: 20
    })
      .then((result) => {
        this.setData({
          reminders: result.items || []
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '首页加载失败', icon: 'none' });
      })
      .then(() => this.setData({ loading: false }));
  },

  openArticle(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.detail.id}` });
  }
});
