const config = require('../config');

const MAX_IMPORT_RUNS = 20;
const MAX_SEND_LOGS = 50;

let writeQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    version: 1,
    updated_at: '',
    users: [],
    subscriptions: {},
    todo_snapshots: {
      items: [],
      imported_at: ''
    },
    import_runs: [],
    reminder_send_logs: []
  };
}

function isConfigured() {
  return config.storage.mode === 'remote-json';
}

function storageName() {
  return 'remote-json';
}

function normalizeUser(user) {
  if (!user || !user.id || !user.openid) return null;
  const account = String(user.internal_account || '').trim();
  return {
    id: String(user.id),
    openid: String(user.openid),
    nickname: String(user.nickname || `YYT user ${account}`),
    internal_account: account,
    role: String(user.role || 'viewer'),
    role_name: String(user.role_name || 'subscriber'),
    department: String(user.department || 'YYT'),
    bind_type: 'user_id',
    bound: user.bound !== false,
    permissions: Array.isArray(user.permissions) ? user.permissions : ['article:read', 'message:read'],
    created_at: user.created_at || nowIso(),
    updated_at: user.updated_at || nowIso()
  };
}

function normalizeSubscription(subscription) {
  if (!subscription) {
    return {
      enabled: false,
      mock: false,
      template_ids: [],
      remaining_count: 0,
      accepted: false,
      updated_at: ''
    };
  }
  const remainingCount = Math.max(0, Number(subscription.remaining_count || 0));
  return {
    enabled: Boolean(subscription.enabled) && remainingCount > 0,
    mock: Boolean(subscription.mock),
    template_ids: Array.isArray(subscription.template_ids) ? subscription.template_ids.map(String) : [],
    remaining_count: remainingCount,
    accepted: Boolean(subscription.accepted),
    raw: subscription.raw || null,
    updated_at: subscription.updated_at || ''
  };
}

function normalizeSnapshot(item) {
  if (!item) return null;
  const normalized = {
    id: String(item.id || ''),
    snapshotDate: String(item.snapshotDate || item.snapshot_date || ''),
    userId: String(item.userId || item.user_id || ''),
    userName: String(item.userName || item.user_name || ''),
    pendingCount: Number(item.pendingCount || item.pending_count || 0),
    content: String(item.content || '')
  };
  return normalized.id && normalized.userId ? normalized : null;
}

function normalizeState(raw) {
  const state = Object.assign(defaultState(), raw || {});
  state.users = (Array.isArray(state.users) ? state.users : [])
    .map(normalizeUser)
    .filter(Boolean);
  state.subscriptions = Object.keys(state.subscriptions || {}).reduce((result, userId) => {
    result[userId] = normalizeSubscription(state.subscriptions[userId]);
    return result;
  }, {});
  const snapshots = state.todo_snapshots || {};
  state.todo_snapshots = {
    items: (Array.isArray(snapshots.items) ? snapshots.items : [])
      .map(normalizeSnapshot)
      .filter(Boolean),
    imported_at: snapshots.imported_at || ''
  };
  state.import_runs = (Array.isArray(state.import_runs) ? state.import_runs : []).slice(0, MAX_IMPORT_RUNS);
  state.reminder_send_logs = (Array.isArray(state.reminder_send_logs) ? state.reminder_send_logs : []).slice(0, MAX_SEND_LOGS);
  state.updated_at = state.updated_at || '';
  return state;
}

function buildUrl(path) {
  return `${config.remoteState.baseUrl.replace(/\/+$/, '')}${path}`;
}

async function requestState(method, path, body) {
  if (!isConfigured()) return defaultState();
  if (!config.remoteState.baseUrl || !config.remoteState.token) {
    throw new Error('REMOTE_STATE_API_BASE_URL and REMOTE_STATE_TOKEN must be configured when STORAGE_MODE=remote-json.');
  }
  if (typeof fetch !== 'function') {
    throw new Error('Current Node.js runtime does not support fetch.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.remoteState.timeoutMs);
  try {
    const response = await fetch(buildUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        'content-type': 'application/json',
        Authorization: `Bearer ${config.remoteState.token}`
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && (payload.message || payload.error);
      throw new Error(`Remote state API failed: HTTP ${response.status}${message ? ` ${message}` : ''}`);
    }
    return payload && payload.data !== undefined ? payload.data : payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadState() {
  if (!isConfigured()) return defaultState();
  return normalizeState(await requestState('GET', '/state'));
}

async function saveState(state) {
  const normalized = normalizeState(state);
  normalized.updated_at = nowIso();
  await requestState('PUT', '/state', normalized);
  return normalized;
}

function updateState(mutator) {
  const next = writeQueue.then(async () => {
    const state = await loadState();
    const result = await mutator(state);
    await saveState(state);
    return result;
  });
  writeQueue = next.catch(() => {});
  return next;
}

function userFromState(user) {
  return user ? clone(normalizeUser(user)) : null;
}

function subscriptionFromState(subscription) {
  return clone(normalizeSubscription(subscription));
}

function createUser(openid, account) {
  const current = nowIso();
  return {
    id: `u_${account}`,
    openid: String(openid),
    nickname: `YYT user ${account}`,
    internal_account: String(account),
    role: 'viewer',
    role_name: 'subscriber',
    department: 'YYT',
    bind_type: 'user_id',
    bound: true,
    permissions: ['article:read', 'message:read'],
    created_at: current,
    updated_at: current
  };
}

async function findUserByOpenid(openid) {
  const state = await loadState();
  return userFromState(state.users.find((user) => user.openid === openid));
}

async function findUserById(id) {
  const state = await loadState();
  return userFromState(state.users.find((user) => user.id === id));
}

async function bindUser(openid, internalAccount) {
  const account = String(internalAccount || '').trim();
  const userId = `u_${account}`;
  return updateState((state) => {
    const claimed = state.users.find((user) => user.internal_account === account && user.openid !== openid);
    if (claimed) {
      const error = new Error('This user ID is already bound to another WeChat account.');
      error.status = 409;
      throw error;
    }
    state.users = state.users.filter((user) => user.openid !== openid && user.id !== userId);
    const user = createUser(openid, account);
    state.users.push(user);
    return userFromState(user);
  });
}

async function saveSubscription(userId, payload) {
  return updateState((state) => {
    const accepted = Boolean(payload.accepted);
    const current = normalizeSubscription(state.subscriptions[userId]);
    const next = {
      enabled: accepted,
      accepted,
      mock: Boolean(payload.mock),
      template_ids: Array.isArray(payload.template_ids) ? payload.template_ids.map(String) : [],
      raw: payload.raw || payload.error || null,
      remaining_count: accepted ? Number(current.remaining_count || 0) + 1 : 0,
      updated_at: nowIso()
    };
    state.subscriptions[userId] = next;
    return subscriptionFromState(next);
  });
}

async function getSubscription(userId) {
  const state = await loadState();
  return subscriptionFromState(state.subscriptions[userId]);
}

async function listReminderRecipients() {
  const state = await loadState();
  return state.users
    .map((user) => ({ user: userFromState(user), subscription: subscriptionFromState(state.subscriptions[user.id]) }))
    .filter((item) => item.subscription.enabled && Number(item.subscription.remaining_count || 0) > 0);
}

async function consumeSubscription(userId) {
  await updateState((state) => {
    const current = normalizeSubscription(state.subscriptions[userId]);
    current.remaining_count = Math.max(Number(current.remaining_count || 0) - 1, 0);
    current.enabled = current.remaining_count > 0;
    current.updated_at = nowIso();
    state.subscriptions[userId] = current;
  });
}

async function recordImportRun(payload) {
  await updateState((state) => {
    state.import_runs.unshift({
      status: payload.status || 'success',
      source: payload.source || 'todo-stat-snapshots',
      imported_count: Number(payload.imported_count || 0),
      storage: payload.storage || storageName(),
      started_at: (payload.started_at ? new Date(payload.started_at) : new Date()).toISOString(),
      finished_at: (payload.finished_at ? new Date(payload.finished_at) : new Date()).toISOString(),
      meta: payload.meta || null,
      error_message: payload.error_message || ''
    });
    state.import_runs = state.import_runs.slice(0, MAX_IMPORT_RUNS);
  });
}

async function getLastImportRun() {
  const state = await loadState();
  return clone(state.import_runs[0] || null);
}

async function recordReminderSend(payload) {
  await updateState((state) => {
    state.reminder_send_logs.unshift({
      user_id: payload.user_id,
      openid: payload.openid,
      snapshot_id: payload.snapshot_id,
      template_id: payload.template_id || '',
      pending_count: Number(payload.pending_count || 0),
      sent: Boolean(payload.sent),
      mock: Boolean(payload.mock),
      result: payload.result || null,
      error_message: payload.error_message || '',
      created_at: nowIso()
    });
    state.reminder_send_logs = state.reminder_send_logs.slice(0, MAX_SEND_LOGS);
  });
}

async function getLastReminderSend(userId) {
  const state = await loadState();
  const item = state.reminder_send_logs.find((log) => !userId || log.user_id === userId);
  return clone(item || null);
}

function filterAndPage(items, query) {
  const q = query || {};
  const page = Math.max(1, Number(q.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize || q.page_size || 20)));
  const userId = q.userId || q.user_id || '';
  const snapshotDate = q.snapshotDate || q.snapshot_date || '';
  let list = items.slice();
  if (userId) list = list.filter((item) => item.userId === String(userId));
  if (snapshotDate) list = list.filter((item) => item.snapshotDate === String(snapshotDate));
  list.sort((a, b) => Number(b.pendingCount || 0) - Number(a.pendingCount || 0) || a.userName.localeCompare(b.userName, 'zh-Hans-CN'));
  return {
    items: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    pageSize,
    source: `${storageName()}-import`
  };
}

async function saveSnapshots(items, importedAt) {
  const normalized = (Array.isArray(items) ? items : []).map(normalizeSnapshot).filter(Boolean);
  const currentImportedAt = importedAt || nowIso();
  await updateState((state) => {
    state.todo_snapshots = {
      items: normalized,
      imported_at: currentImportedAt
    };
  });
  return {
    imported_count: normalized.length,
    storage: storageName(),
    imported_at: currentImportedAt
  };
}

async function listSnapshots(query) {
  const state = await loadState();
  const result = filterAndPage(state.todo_snapshots.items, query);
  result.imported_at = state.todo_snapshots.imported_at || '';
  return result;
}

module.exports = {
  isConfigured,
  storageName,
  loadState,
  saveSnapshots,
  listSnapshots,
  findUserByOpenid,
  findUserById,
  bindUser,
  saveSubscription,
  getSubscription,
  listReminderRecipients,
  consumeSubscription,
  recordImportRun,
  getLastImportRun,
  recordReminderSend,
  getLastReminderSend
};
