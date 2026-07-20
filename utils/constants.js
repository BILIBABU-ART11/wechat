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
  pending: '待关注',
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

const API_ENV = 'cloud';
const API_BASE_URLS = {
  local: 'http://192.168.0.77:3000',
  cloud: 'https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com'
};

module.exports = {
  APP_NAME: '院院通',
  REQUEST_MODE: 'backend',
  MOCK_ENABLED: false,
  ENABLE_MOCK_FALLBACK: false,
  API_ENV,
  API_BASE_URL: API_BASE_URLS[API_ENV],
  REQUIRE_BIND_ON_LAUNCH: true,
  TOKEN_KEY: 'neurogaze_token',
  USER_KEY: 'neurogaze_user',
  SUBSCRIBE_STATE_KEY: 'neurogaze_subscribe_state',
  STATUS_LABELS,
  STATUS_VALUES,
  STATUS_OPTIONS: [
    { label: '全部阶段', value: '' },
    { label: '待关注', value: 'pending' },
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
    viewer: '观察员'
  },
  SUBSCRIBE_TEMPLATE_IDS: []
};
