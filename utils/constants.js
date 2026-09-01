const STATUS_LABELS = {
  new: '新项目',
  evaluating: '待评估',
  materials: '材料准备中',
  submit_due: '待提交',
  submitted: '已提交',
  opening: '开标中',
  follow_up: '结果跟进',
  completed: '已完成',
  abandoned: '已放弃',
  pending: '待处理',
  processing: '跟进中',
  done: '已完成',
  ignored: '已忽略'
};

const STATUS_VALUES = {
  new: 'new',
  evaluating: 'evaluating',
  materials: 'materials',
  submit_due: 'submit_due',
  submitted: 'submitted',
  opening: 'opening',
  follow_up: 'follow_up',
  completed: 'completed',
  abandoned: 'abandoned',
  pending: 'pending',
  processing: 'processing',
  done: 'done',
  ignored: 'ignored'
};

const CLOUD_ENV_ID = 'prod-d5g6lfndn063b2d5d';
const CLOUD_SERVICE_NAME = 'express-0kx6';

module.exports = {
  APP_NAME: '院院通',
  REQUEST_MODE: 'backend',
  MOCK_ENABLED: false,
  ENABLE_MOCK_FALLBACK: false,
  CLOUD_ENV_ID,
  CLOUD_SERVICE_NAME,
  REQUIRE_BIND_ON_LAUNCH: false,
  TOKEN_KEY: 'yuanyuantong_token',
  USER_KEY: 'yuanyuantong_user',
  BIND_TOKEN_KEY: 'yuanyuantong_bind_token',
  SUBSCRIBE_STATE_KEY: 'yuanyuantong_subscribe_state',
  STATUS_LABELS,
  STATUS_VALUES,
  STATUS_OPTIONS: [
    { label: '全部状态', value: '' },
    { label: '待处理', value: 'pending' },
    { label: '已完成', value: 'completed' }
  ],
  CATEGORIES: ['全部', '待办统计'],
  SCORE_FILTERS: [
    { label: '全部', value: 'all' },
    { label: '20条以上', value: '4' },
    { label: '40条以上', value: '5' }
  ],
  ROLE_LABELS: {
    admin: '管理员',
    analyst: '分析员',
    viewer: '订阅用户'
  },
  SUBSCRIBE_TEMPLATE_IDS: []
};
