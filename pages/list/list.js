const api = require('../../services/api');
const authGuard = require('../../utils/authGuard');
const {
  CATEGORIES,
  SCORE_FILTERS
} = require('../../utils/constants');

Page({
  data: {
    loading: true,
    categories: CATEGORIES,
    scoreFilters: SCORE_FILTERS,
    activeCategory: '全部',
    activeScore: 'all',
    articles: [],
    total: 0,
    page: 1
  },

  onLoad() {
    if (!authGuard.requireLogin()) return;
    this.loadArticles();
  },

  onShow() {
    authGuard.requireLogin();
  },

  onPullDownRefresh() {
    if (!authGuard.requireLogin()) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadArticles(true)
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh());
  },

  loadArticles(isRefresh) {
    if (!isRefresh) this.setData({ loading: true });
    return api.getArticles({
      category: this.data.activeCategory,
      score: this.data.activeScore,
      page: this.data.page,
      page_size: 20
    })
      .then((result) => {
        this.setData({
          articles: result.items || [],
          total: result.total || 0
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '待办加载失败', icon: 'none' });
      })
      .then(() => this.setData({ loading: false }));
  },

  selectCategory(event) {
    if (!authGuard.requireLogin()) return;
    this.setData({
      activeCategory: event.currentTarget.dataset.category,
      page: 1
    });
    this.loadArticles();
  },

  selectScore(event) {
    if (!authGuard.requireLogin()) return;
    this.setData({
      activeScore: event.currentTarget.dataset.score,
      page: 1
    });
    this.loadArticles();
  },

  openArticle(event) {
    if (!authGuard.requireLogin()) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.detail.id}` });
  }
});
