const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const reminderTimeZone = process.env.REMINDER_TIME_ZONE || 'Asia/Shanghai';
process.env.TZ = process.env.TZ || reminderTimeZone;

function readBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function readList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function readMysqlAddress(value) {
  const [host, port] = String(value || '').split(':');
  return {
    host: host || '',
    port: Number(port || 3306)
  };
}

const mysqlAddress = readMysqlAddress(process.env.MYSQL_ADDRESS);

module.exports = {
  port: Number(process.env.PORT || 3000),
  mockMode: readBool(process.env.MOCK_MODE, true),
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
  tokenSecret: process.env.APP_TOKEN_SECRET || 'mock-secret',
  todoImportToken: process.env.TODO_IMPORT_TOKEN || '',
  enableEgressIpCheck: readBool(process.env.ENABLE_EGRESS_IP_CHECK, true),
  todoApi: {
    baseUrl: process.env.TODO_API_BASE_URL || 'https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73',
    apiKey: process.env.TODO_API_KEY || '',
    timeoutMs: Number(process.env.TODO_API_TIMEOUT_MS || 10000),
    dataSource: process.env.TODO_DATA_SOURCE || 'api',
    dataFile: process.env.TODO_DATA_FILE || path.resolve(__dirname, '..', '..', 'real-data', 'todo-snapshots-latest.json')
  },
  reminderSchedule: {
    enabled: readBool(process.env.REMINDER_SCHEDULE_ENABLED, true),
    times: readList(process.env.REMINDER_SCHEDULE_TIMES || '09:00,17:00'),
    pollMs: Number(process.env.REMINDER_SCHEDULE_POLL_MS || 60000),
    pageSize: Number(process.env.REMINDER_FETCH_PAGE_SIZE || 100),
    sendOnlyPending: readBool(process.env.REMINDER_SEND_ONLY_PENDING, true),
    timeZone: reminderTimeZone
  },
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
    subscribeTemplateId: process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID || '',
    templatePage: process.env.WECHAT_SUBSCRIBE_TEMPLATE_PAGE || 'pages/index/index'
  },
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    appToken: process.env.FEISHU_APP_TOKEN || '',
    tableId: process.env.FEISHU_TABLE_ID || ''
  },
  mysql: {
    host: mysqlAddress.host,
    port: mysqlAddress.port,
    user: process.env.MYSQL_USERNAME || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'nodejs_demo'
  },
  subscribeTemplateIds: readList(process.env.SUBSCRIBE_TEMPLATE_IDS)
};
