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
  return { host: host || '', port: Number(port || 3306) };
}

function readJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function readWechatApiBaseUrl(value) {
  const url = new URL(value || 'https://api.weixin.qq.com');
  if (url.hostname !== 'api.weixin.qq.com' || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('WECHAT_API_BASE_URL must use http(s)://api.weixin.qq.com.');
  }
  return url.origin;
}

function validateTemplateFields(fields) {
  const required = ['title', 'count', 'content', 'date'];
  const pattern = /^(thing|number|date|time|character_string)\d+$/;
  const legacyValid = required.every((key) => typeof fields[key] === 'string' && pattern.test(fields[key]));
  const reminderValid = /^time\d+$/.test(fields.time || '') && /^thing\d+$/.test(fields.content || '');
  const values = reminderValid ? [fields.time, fields.content] : required.map((key) => fields[key]);
  return (legacyValid || reminderValid) && new Set(values).size === values.length;
}

const mysqlAddress = readMysqlAddress(process.env.MYSQL_ADDRESS);
const mockMode = readBool(process.env.MOCK_MODE, true);
const templateFields = readJsonObject(process.env.WECHAT_SUBSCRIBE_TEMPLATE_FIELDS);

const config = {
  port: Number(process.env.PORT || 3000),
  mockMode,
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
  tokenSecret: process.env.APP_TOKEN_SECRET || 'mock-secret',
  todoImportToken: process.env.TODO_IMPORT_TOKEN || '',
  enableEgressIpCheck: readBool(process.env.ENABLE_EGRESS_IP_CHECK, false),
  storage: {
    mode: process.env.STORAGE_MODE || ''
  },
  cos: {
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || '',
    stateKey: process.env.COS_STATE_KEY || 'yyt/yyt-state.json',
    stateFile: process.env.COS_STATE_FILE || process.env.JSON_STATE_FILE || '',
    secretId: process.env.COS_SECRET_ID || process.env.TENCENTCLOUD_SECRETID || process.env.TENCENTCLOUD_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY || process.env.TENCENTCLOUD_SECRET_KEY || '',
    sessionToken: process.env.COS_SESSION_TOKEN || process.env.TENCENTCLOUD_SESSIONTOKEN || process.env.TENCENTCLOUD_TOKEN || ''
  },
  remoteState: {
    baseUrl: process.env.REMOTE_STATE_API_BASE_URL || '',
    token: process.env.REMOTE_STATE_TOKEN || '',
    timeoutMs: Number(process.env.REMOTE_STATE_TIMEOUT_MS || 10000)
  },
  todoApi: {
    baseUrl: process.env.TODO_API_BASE_URL || 'https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73',
    apiKey: process.env.TODO_API_KEY || '',
    timeoutMs: Number(process.env.TODO_API_TIMEOUT_MS || 10000),
    dataSource: process.env.TODO_DATA_SOURCE || 'import',
    dataFile: process.env.TODO_DATA_FILE || path.resolve(__dirname, '..', '..', 'real-data', 'todo-snapshots-latest.json')
  },
  reminderSchedule: {
    enabled: readBool(process.env.REMINDER_SCHEDULE_ENABLED, mockMode),
    times: readList(process.env.REMINDER_SCHEDULE_TIMES || '09:20,17:20'),
    pollMs: Number(process.env.REMINDER_SCHEDULE_POLL_MS || 60000),
    pageSize: Number(process.env.REMINDER_FETCH_PAGE_SIZE || 100),
    sendOnlyPending: readBool(process.env.REMINDER_SEND_ONLY_PENDING, true),
    timeZone: reminderTimeZone
  },
  wechat: {
    apiBaseUrl: readWechatApiBaseUrl(process.env.WECHAT_API_BASE_URL),
    appId: process.env.WECHAT_APP_ID || '',
    appSecret: process.env.WECHAT_APP_SECRET || '',
    subscribeTemplateId: process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID || '',
    templatePage: process.env.WECHAT_SUBSCRIBE_TEMPLATE_PAGE || 'pages/index/index',
    templateFields,
    templateFieldsValid: validateTemplateFields(templateFields)
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

config.wechatLoginReadiness = function wechatLoginReadiness() {
  if (config.mockMode) return { ready: true, reasons: [] };
  const reasons = [];
  if (!config.wechat.appId) reasons.push('WECHAT_APP_ID');
  if (!config.wechat.appSecret) reasons.push('WECHAT_APP_SECRET');
  return { ready: reasons.length === 0, reasons };
};

config.readiness = function readiness() {
  if (config.mockMode) return { ready: true, reasons: [] };
  const reasons = [];
  if (!config.tokenSecret || config.tokenSecret === 'mock-secret') reasons.push('APP_TOKEN_SECRET is missing');
  if (!config.todoImportToken) reasons.push('TODO_IMPORT_TOKEN is missing');
  config.wechatLoginReadiness().reasons.forEach((name) => reasons.push(`${name} is missing`));
  if (!config.wechat.subscribeTemplateId && !config.subscribeTemplateIds.length) reasons.push('WECHAT_SUBSCRIBE_TEMPLATE_ID is missing');
  if (!config.wechat.templateFieldsValid) reasons.push('WECHAT_SUBSCRIBE_TEMPLATE_FIELDS is invalid');
  if (config.storage.mode === 'remote-json' && (!config.remoteState.baseUrl || !config.remoteState.token)) {
    reasons.push('remote JSON storage is incomplete');
  }
  return { ready: reasons.length === 0, reasons };
};

config.assertStartup = function assertStartup() {
  if (!config.mockMode && (!config.tokenSecret || config.tokenSecret === 'mock-secret')) {
    throw new Error('APP_TOKEN_SECRET must be configured for production.');
  }
};

module.exports = config;
