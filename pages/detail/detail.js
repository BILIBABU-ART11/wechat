const api = require('../../services/api');
const authGuard = require('../../utils/authGuard');

Page({
  data: {
    id: '',
    loading: true,
    article: null
  },

  onLoad(options) {
    if (!authGuard.requireLogin()) return;
    this.setData({ id: options.id || '' });
    this.loadDetail();
  },

  loadDetail() {
    if (!this.data.id) return;
    this.setData({ loading: true });
    api.getArticleDetail(this.data.id)
      .then((article) => this.setData({ article }))
      .catch((error) => {
        wx.showToast({ title: error.message || '详情加载失败', icon: 'none' });
      })
      .then(() => this.setData({ loading: false }));
  },

  copyLink() {
    if (!authGuard.requireLogin()) return;
    const article = this.data.article;
    if (!article || !article.original_url) {
      wx.showToast({ title: '暂无来源链接', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: article.original_url,
      success() {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      }
    });
  }
});
