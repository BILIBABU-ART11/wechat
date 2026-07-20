Component({
  properties: {
    article: {
      type: Object,
      value: {}
    }
  },
  methods: {
    handleTap() {
      this.triggerEvent('open', { id: this.data.article.id });
    }
  }
});
