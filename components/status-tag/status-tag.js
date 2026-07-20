const { STATUS_LABELS } = require('../../utils/constants');

const CLASS_MAP = {
  new: 'status-new',
  evaluating: 'status-evaluating',
  materials: 'status-materials',
  submit_due: 'status-submit-due',
  submitted: 'status-submitted',
  opening: 'status-opening',
  follow_up: 'status-follow-up',
  completed: 'status-completed',
  abandoned: 'status-abandoned',
  pending: 'status-pending',
  processing: 'status-processing',
  done: 'status-done',
  ignored: 'status-ignored'
};

Component({
  properties: {
    status: {
      type: String,
      value: 'new',
      observer(value) {
        this.updateTag(value);
      }
    }
  },
  data: {
    label: '新项目',
    className: 'status-new'
  },
  lifetimes: {
    attached() {
      this.updateTag(this.data.status);
    }
  },
  methods: {
    updateTag(status) {
      this.setData({
        label: STATUS_LABELS[status] || status || '新项目',
        className: CLASS_MAP[status] || 'status-new'
      });
    }
  }
});
