const auth = require('../../services/auth');

Page({
  data: {
    loading: false,
    activeBindType: 'user_id',
    bindValue: '',
    placeholder: '请输入院院通用户ID授权码'
  },

  handleInput(event) {
    this.setData({ bindValue: event.detail.value });
  },

  submitBind() {
    if (this.data.loading) return;
    const bindValue = String(this.data.bindValue || '').trim();
    if (!/^\d{6,}$/.test(bindValue)) {
      wx.showToast({ title: '请输入有效用户ID授权码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    auth.bindAccount({
      bind_type: 'user_id',
      bind_value: bindValue
    })
      .then((result) => {
        getApp().globalData.user = result.user;
        wx.showToast({ title: '绑定成功', icon: 'success' });
        wx.switchTab({ url: '/pages/index/index' });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || '绑定失败', icon: 'none' });
      })
      .then(() => this.setData({ loading: false }));
  }
});
