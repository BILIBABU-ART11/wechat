const { scoreLevel } = require('../../utils/format');

Component({
  properties: {
    score: {
      type: Number,
      value: 0,
      observer(value) {
        this.updateScore(value);
      }
    }
  },
  data: {
    className: 'score-low'
  },
  lifetimes: {
    attached() {
      this.updateScore(this.data.score);
    }
  },
  methods: {
    updateScore(score) {
      this.setData({ className: `score-${scoreLevel(score)}` });
    }
  }
});
