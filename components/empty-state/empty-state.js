Component({
  properties: {
    title: {
      type: String,
      value: '暂无内容'
    },
    desc: {
      type: String,
      value: '稍后刷新试试'
    },
    actionText: {
      type: String,
      value: ''
    }
  },
  methods: {
    handleAction() {
      this.triggerEvent('action');
    }
  }
});
