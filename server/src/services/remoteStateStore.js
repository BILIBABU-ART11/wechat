const crypto = require('crypto');
const config = require('../config');

function isConfigured() {
  return config.storage.mode === 'remote-json';
}

function storageName() {
  return 'remote-json';
}

function buildUrl(route, query) {
  const url = new URL(`${config.remoteState.baseUrl.replace(/\/+$/, '')}${route}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url;
}

async function request(method, route, body, query) {
  if (!isConfigured()) return null;
  if (!config.remoteState.baseUrl || !config.remoteState.token) {
    throw new Error('REMOTE_STATE_API_BASE_URL and REMOTE_STATE_TOKEN must be configured when STORAGE_MODE=remote-json.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.remoteState.timeoutMs);
  try {
    const response = await fetch(buildUrl(route, query), {
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
      const error = new Error((payload && payload.message) || `Remote state API failed: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload && payload.data !== undefined ? payload.data : payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Remote state API request timed out.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function legacyBatchId(items, importedAt) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(items || [])).digest('hex').slice(0, 12);
  return `legacy-${String(importedAt || Date.now()).replace(/[^0-9]/g, '').slice(0, 14)}-${digest}`;
}


async function findUserByOpenid(openid) {
  return request('GET', '/users/by-openid', undefined, { openid });
}

async function findUserById(id) {
  return request('GET', `/users/${encodeURIComponent(id)}`);
}

async function bindUser(openid, internalAccount) {
  return request('POST', '/users/bind', {
    openid,
    internal_account: String(internalAccount || '')
  });
}

async function saveSubscription(userId, payload) {
  const templateIds = Array.isArray(payload.accepted_template_ids)
    ? payload.accepted_template_ids
    : (payload.accepted ? (payload.template_ids || []) : []);
  return request('PUT', `/subscriptions/${encodeURIComponent(userId)}`, {
    request_id: payload.request_id || `legacy-${crypto.randomUUID()}`,
    accepted_template_ids: templateIds,
    raw: payload.raw || payload.error || null,
    mock: Boolean(payload.mock)
  });
}

async function getSubscription(userId) {
  return request('GET', `/subscriptions/${encodeURIComponent(userId)}`);
}

async function listReminderRecipients() {
  return request('GET', '/reminder-recipients');
}

async function consumeSubscription(userId, templateId, disable) {
  return request('POST', `/subscriptions/${encodeURIComponent(userId)}/consume`, {
    template_id: templateId,
    disable: Boolean(disable)
  });
}

async function saveSnapshots(items, importedAt, batchId) {
  const currentBatchId = batchId || legacyBatchId(items, importedAt);
  return request('POST', '/todo/snapshots', {
    batch_id: currentBatchId,
    imported_at: importedAt,
    data: { items }
  });
}

async function listSnapshots(query) {
  return request('GET', '/todo/snapshots', undefined, query || {});
}

async function claimImportBatch(batchId, payload) {
  return request('POST', `/imports/${encodeURIComponent(batchId)}/claim`, payload || {});
}

async function completeImportBatch(batchId, payload) {
  return request('POST', `/imports/${encodeURIComponent(batchId)}/complete`, payload || {});
}

async function recordImportRun(payload) {
  const snapshot = await listSnapshots({ page: 1, pageSize: 1 });
  const batchId = payload.batch_id || snapshot.batch_id;
  if (!batchId) return null;
  const claim = await claimImportBatch(batchId, { source: payload.source });
  if (!claim.claimed && claim.batch && claim.batch.status !== 'processing') return claim.batch;
  return completeImportBatch(batchId, {
    status: payload.status || 'success',
    result: payload,
    error_message: payload.error_message || ''
  });
}

async function getLastImportRun() {
  return request('GET', '/imports/latest');
}

async function getImportBatch(batchId) {
  return request('GET', `/imports/${encodeURIComponent(batchId)}`);
}

async function claimReminderSend(payload) {
  return request('POST', '/reminder-sends/claim', payload);
}

async function completeReminderSend(payload) {
  return request('POST', '/reminder-sends/complete', payload);
}

async function recordReminderSend(payload) {
  const sendKey = payload.send_key || [
    payload.batch_id || 'legacy',
    payload.user_id,
    payload.snapshot_id,
    payload.template_id
  ].join(':');
  const claim = await claimReminderSend(Object.assign({}, payload, { send_key: sendKey }));
  if (!claim.claimed) return claim.send;
  return completeReminderSend(Object.assign({}, payload, {
    send_key: sendKey,
    status: payload.sent ? 'sent' : 'failed'
  }));
}

async function getLastReminderSend(userId) {
  return request('GET', '/reminder-sends/latest', undefined, { userId });
}

module.exports = {
  isConfigured,
  storageName,

  saveSnapshots,
  listSnapshots,
  findUserByOpenid,
  findUserById,
  bindUser,
  saveSubscription,
  getSubscription,
  listReminderRecipients,
  consumeSubscription,
  claimImportBatch,
  completeImportBatch,
  recordImportRun,
  getLastImportRun,
  getImportBatch,
  claimReminderSend,
  completeReminderSend,
  recordReminderSend,
  getLastReminderSend
};
