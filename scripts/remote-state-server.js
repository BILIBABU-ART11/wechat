#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const express = require('express');

const MAX_IMPORT_RUNS = 20;
const MAX_SEND_LOGS = 100;
const MAX_BATCHES = 100;
const MAX_SUBSCRIBE_REQUESTS = 200;
let writeQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    version: 2,
    revision: 0,
    updated_at: '',
    users: [],
    subscriptions: {},
    subscribe_requests: {},
    todo_snapshots: {
      items: [],
      imported_at: '',
      batch_id: ''
    },
    import_runs: [],
    import_batches: {},
    reminder_send_logs: []
  };
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
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
  return normalized.id && normalized.userId && Number.isFinite(normalized.pendingCount) ? normalized : null;
}

function normalizeSubscription(subscription) {
  const source = subscription || {};
  const templateIds = Array.isArray(source.template_ids) ? source.template_ids.map(String) : [];
  const grants = {};
  Object.entries(source.grants || {}).forEach(([templateId, count]) => {
    const normalizedCount = Math.max(0, Number(count || 0));
    if (templateId && Number.isFinite(normalizedCount)) grants[String(templateId)] = normalizedCount;
  });
  const legacyCount = Math.max(0, Number(source.remaining_count || 0));
  if (!Object.keys(grants).length && legacyCount > 0 && templateIds[0]) {
    grants[templateIds[0]] = legacyCount;
  }
  const allTemplateIds = [...new Set([...templateIds, ...Object.keys(grants)])];
  const remainingCount = Object.values(grants).reduce((sum, count) => sum + count, 0);
  return {
    enabled: remainingCount > 0,
    mock: Boolean(source.mock),
    template_ids: allTemplateIds,
    grants,
    remaining_count: remainingCount,
    accepted: Boolean(source.accepted),
    raw: source.raw || null,
    updated_at: source.updated_at || ''
  };
}

function normalizeUser(user) {
  if (!user || !user.id || !user.openid) return null;
  const account = String(user.internal_account || '').trim();
  return {
    id: String(user.id),
    openid: String(user.openid),
    nickname: String(user.nickname || `院院通用户${account}`),
    internal_account: account,
    role: String(user.role || 'viewer'),
    role_name: String(user.role_name || '订阅用户'),
    department: String(user.department || '院院通'),
    bind_type: 'user_id',
    bound: user.bound !== false,
    permissions: Array.isArray(user.permissions) ? user.permissions : ['article:read', 'message:read'],
    created_at: user.created_at || nowIso(),
    updated_at: user.updated_at || nowIso()
  };
}

function pruneObject(source, maxItems) {
  return Object.fromEntries(
    Object.entries(source || {})
      .sort((a, b) => String(b[1].updated_at || b[1].created_at || '').localeCompare(String(a[1].updated_at || a[1].created_at || '')))
      .slice(0, maxItems)
  );
}

function normalizeState(raw) {
  const source = raw || {};
  const state = Object.assign(defaultState(), source);
  state.version = 2;
  state.revision = Math.max(0, Number(source.revision || 0));
  state.users = (Array.isArray(source.users) ? source.users : []).map(normalizeUser).filter(Boolean);
  state.subscriptions = Object.keys(source.subscriptions || {}).reduce((result, userId) => {
    result[userId] = normalizeSubscription(source.subscriptions[userId]);
    return result;
  }, {});
  state.subscribe_requests = pruneObject(source.subscribe_requests, MAX_SUBSCRIBE_REQUESTS);
  const snapshots = source.todo_snapshots || {};
  state.todo_snapshots = {
    items: (Array.isArray(snapshots.items) ? snapshots.items : []).map(normalizeSnapshot).filter(Boolean),
    imported_at: snapshots.imported_at || '',
    batch_id: snapshots.batch_id || source.current_batch_id || ''
  };
  state.import_runs = (Array.isArray(source.import_runs) ? source.import_runs : []).slice(0, MAX_IMPORT_RUNS);
  state.import_batches = pruneObject(source.import_batches, MAX_BATCHES);
  state.reminder_send_logs = (Array.isArray(source.reminder_send_logs) ? source.reminder_send_logs : []).slice(0, MAX_SEND_LOGS);
  state.updated_at = source.updated_at || '';
  return state;
}

async function readJsonFile(file) {
  const text = await fs.readFile(file, 'utf8');
  return normalizeState(JSON.parse(text.replace(/^\uFEFF/, '')));
}

async function readState(stateFile) {
  try {
    return await readJsonFile(stateFile);
  } catch (mainError) {
    try {
      return await readJsonFile(`${stateFile}.bak`);
    } catch (backupError) {
      if (mainError.code === 'ENOENT' && backupError.code === 'ENOENT') return defaultState();
      const error = new Error('State file and backup are unreadable; refusing to create an empty state.');
      error.cause = { main: mainError.message, backup: backupError.message };
      throw error;
    }
  }
}

async function atomicWriteState(stateFile, state) {
  const normalized = normalizeState(state);
  normalized.updated_at = nowIso();
  const directory = path.dirname(stateFile);
  const backupFile = `${stateFile}.bak`;
  const tempFile = `${stateFile}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(directory, { recursive: true });

  let handle;
  try {
    handle = await fs.open(tempFile, 'w', 0o600);
    await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    if (handle) await handle.close();
  }
  await fs.chmod(tempFile, 0o600).catch(() => {});

  let movedExisting = false;
  try {
    await fs.rm(backupFile, { force: true });
    try {
      await fs.rename(stateFile, backupFile);
      await fs.chmod(backupFile, 0o600).catch(() => {});
      movedExisting = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.rename(tempFile, stateFile);
    await fs.chmod(stateFile, 0o600).catch(() => {});
    if (!movedExisting) {
      await fs.copyFile(stateFile, backupFile);
      await fs.chmod(backupFile, 0o600).catch(() => {});
    }
    return normalized;
  } catch (error) {
    await fs.rm(tempFile, { force: true }).catch(() => {});
    if (movedExisting) {
      await fs.rename(backupFile, stateFile).catch(() => {});
    }
    throw error;
  }
}

function updateState(stateFile, mutator) {
  const next = writeQueue.then(async () => {
    const state = await readState(stateFile);
    const result = await mutator(state);
    state.version = 2;
    state.revision = Number(state.revision || 0) + 1;
    await atomicWriteState(stateFile, state);
    return result;
  });
  writeQueue = next.catch(() => {});
  return next;
}

function readConfig(env) {
  return {
    host: env.REMOTE_STATE_HOST || '0.0.0.0',
    port: Number(env.REMOTE_STATE_PORT || 3100),
    token: env.REMOTE_STATE_TOKEN || '',
    stateFile: env.REMOTE_STATE_FILE || '/opt/yyt-state/yyt-state.json'
  };
}

function authMiddleware(token) {
  return (req, res, next) => {
    if (!token) {
      res.status(500).json({ code: 500, message: 'REMOTE_STATE_TOKEN is not configured', data: null });
      return;
    }
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (bearer !== token) {
      res.status(401).json({ code: 401, message: 'invalid remote state token', data: null });
      return;
    }
    next();
  };
}

function createUser(openid, account) {
  const current = nowIso();
  return normalizeUser({
    id: `u_${account}`,
    openid,
    internal_account: account,
    created_at: current,
    updated_at: current
  });
}

function publicSubscription(value) {
  return normalizeSubscription(value);
}

function filterAndPage(items, query) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || query.page_size || 20)));
  const userId = query.userId || query.user_id || '';
  const snapshotDate = query.snapshotDate || query.snapshot_date || '';
  let list = items.slice();
  if (userId) list = list.filter((item) => item.userId === String(userId));
  if (snapshotDate) list = list.filter((item) => item.snapshotDate === String(snapshotDate));
  list.sort((a, b) => Number(b.pendingCount || 0) - Number(a.pendingCount || 0) || a.userName.localeCompare(b.userName, 'zh-Hans-CN'));
  return {
    items: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    pageSize
  };
}

function createApp(options) {
  const config = Object.assign(readConfig(process.env), options || {});
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', async (req, res) => {
    try {
      const state = await readState(config.stateFile);
      res.json({
        code: 0,
        message: 'ok',
        data: {
          healthy: true,
          version: state.version,
          revision: state.revision,
          updated_at: state.updated_at,
          user_count: state.users.length,
          snapshot_count: state.todo_snapshots.items.length,
          batch_id: state.todo_snapshots.batch_id || ''
        }
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message, data: { healthy: false } });
    }
  });

  app.use(authMiddleware(config.token));

  app.all('/state', (req, res) => {
    res.status(405).json({ code: 405, message: 'whole-state access is disabled; use atomic business endpoints', data: null });
  });

  app.get('/users/by-openid', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      const user = state.users.find((item) => item.openid === String(req.query.openid || '')) || null;
      res.json({ code: 0, message: 'ok', data: user });
    } catch (error) {
      next(error);
    }
  });

  app.get('/users/:id', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      const user = state.users.find((item) => item.id === req.params.id) || null;
      res.json({ code: 0, message: 'ok', data: user });
    } catch (error) {
      next(error);
    }
  });

  app.post('/users/bind', async (req, res, next) => {
    try {
      const openid = String(req.body.openid || '').trim();
      const account = String(req.body.internal_account || '').trim();
      if (!openid || !/^\d{6,}$/.test(account)) throw createHttpError(422, 'invalid openid or internal account');
      const user = await updateState(config.stateFile, (state) => {
        const claimed = state.users.find((item) => item.internal_account === account && item.openid !== openid);
        if (claimed) throw createHttpError(409, 'This user ID is already bound to another WeChat account.');
        const userId = `u_${account}`;
        state.users = state.users.filter((item) => item.openid !== openid && item.id !== userId);
        const created = createUser(openid, account);
        state.users.push(created);
        return created;
      });
      res.json({ code: 0, message: 'ok', data: user });
    } catch (error) {
      next(error);
    }
  });

  app.get('/subscriptions/:userId', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      res.json({ code: 0, message: 'ok', data: publicSubscription(state.subscriptions[req.params.userId]) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/subscriptions/:userId', async (req, res, next) => {
    try {
      const requestId = String(req.body.request_id || '').trim();
      const acceptedIds = Array.isArray(req.body.accepted_template_ids)
        ? [...new Set(req.body.accepted_template_ids.map(String).filter(Boolean))]
        : [];
      if (!requestId) throw createHttpError(422, 'request_id is required');
      const subscription = await updateState(config.stateFile, (state) => {
        if (state.subscribe_requests[requestId]) throw createHttpError(409, 'subscription request has already been used');
        const current = normalizeSubscription(state.subscriptions[req.params.userId]);
        acceptedIds.forEach((templateId) => {
          current.grants[templateId] = Number(current.grants[templateId] || 0) + 1;
        });
        current.template_ids = [...new Set([...current.template_ids, ...acceptedIds])];
        current.remaining_count = Object.values(current.grants).reduce((sum, count) => sum + count, 0);
        current.enabled = current.remaining_count > 0;
        current.accepted = acceptedIds.length > 0;
        current.mock = Boolean(req.body.mock);
        current.raw = req.body.raw || null;
        current.updated_at = nowIso();
        state.subscriptions[req.params.userId] = current;
        state.subscribe_requests[requestId] = {
          user_id: req.params.userId,
          accepted_template_ids: acceptedIds,
          created_at: nowIso(),
          updated_at: nowIso()
        };
        state.subscribe_requests = pruneObject(state.subscribe_requests, MAX_SUBSCRIBE_REQUESTS);
        return publicSubscription(current);
      });
      res.json({ code: 0, message: 'ok', data: subscription });
    } catch (error) {
      next(error);
    }
  });

  app.post('/subscriptions/:userId/consume', async (req, res, next) => {
    try {
      const templateId = String(req.body.template_id || '').trim();
      if (!templateId) throw createHttpError(422, 'template_id is required');
      const subscription = await updateState(config.stateFile, (state) => {
        const current = normalizeSubscription(state.subscriptions[req.params.userId]);
        if (req.body.disable) current.grants[templateId] = 0;
        else current.grants[templateId] = Math.max(Number(current.grants[templateId] || 0) - 1, 0);
        current.remaining_count = Object.values(current.grants).reduce((sum, count) => sum + count, 0);
        current.enabled = current.remaining_count > 0;
        current.updated_at = nowIso();
        state.subscriptions[req.params.userId] = current;
        return publicSubscription(current);
      });
      res.json({ code: 0, message: 'ok', data: subscription });
    } catch (error) {
      next(error);
    }
  });

  app.get('/reminder-recipients', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      const recipients = state.users
        .map((user) => ({ user, subscription: publicSubscription(state.subscriptions[user.id]) }))
        .filter((item) => item.subscription.enabled);
      res.json({ code: 0, message: 'ok', data: recipients });
    } catch (error) {
      next(error);
    }
  });

  app.get('/todo/snapshots', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      const data = filterAndPage(state.todo_snapshots.items, req.query || {});
      data.imported_at = state.todo_snapshots.imported_at || '';
      data.batch_id = state.todo_snapshots.batch_id || '';
      data.source = 'remote-json-import';
      res.json({ code: 0, message: 'ok', data });
    } catch (error) {
      next(error);
    }
  });

  app.post('/todo/snapshots', async (req, res, next) => {
    try {
      const source = req.body && (req.body.data || req.body);
      const items = (Array.isArray(source.items) ? source.items : []).map(normalizeSnapshot).filter(Boolean);
      const batchId = String(req.body.batch_id || (req.body.meta && req.body.meta.batch_id) || '').trim();
      if (!batchId) throw createHttpError(422, 'batch_id is required');
      const importedAt = req.body.imported_at
        || (req.body.meta && (req.body.meta.fetchedAt || req.body.meta.startedAt))
        || nowIso();
      const result = await updateState(config.stateFile, (state) => {
        state.todo_snapshots = { items, imported_at: importedAt, batch_id: batchId };
        return {
          imported_count: items.length,
          storage: 'remote-json',
          imported_at: importedAt,
          batch_id: batchId
        };
      });
      res.json({ code: 0, message: 'ok', data: result });
    } catch (error) {
      next(error);
    }
  });

  app.post('/imports/:batchId/claim', async (req, res, next) => {
    try {
      const result = await updateState(config.stateFile, (state) => {
        if (state.todo_snapshots.batch_id !== req.params.batchId) {
          throw createHttpError(409, 'batch_id does not match the current snapshot');
        }
        const existing = state.import_batches[req.params.batchId];
        if (existing) return { claimed: false, batch: existing };
        const batch = {
          batch_id: req.params.batchId,
          status: 'processing',
          source: req.body.source || 'todo-stat-snapshots',
          started_at: nowIso(),
          updated_at: nowIso(),
          result: null,
          error_message: ''
        };
        state.import_batches[req.params.batchId] = batch;
        state.import_batches = pruneObject(state.import_batches, MAX_BATCHES);
        return { claimed: true, batch };
      });
      res.json({ code: 0, message: 'ok', data: result });
    } catch (error) {
      next(error);
    }
  });

  app.post('/imports/:batchId/complete', async (req, res, next) => {
    try {
      const result = await updateState(config.stateFile, (state) => {
        const batch = state.import_batches[req.params.batchId];
        if (!batch) throw createHttpError(404, 'import batch not found');
        batch.status = req.body.status || 'success';
        batch.finished_at = nowIso();
        batch.updated_at = batch.finished_at;
        batch.result = req.body.result || null;
        batch.error_message = req.body.error_message || '';
        state.import_runs.unshift({
          batch_id: req.params.batchId,
          status: batch.status,
          source: batch.source,
          imported_count: state.todo_snapshots.items.length,
          storage: 'remote-json',
          started_at: batch.started_at,
          finished_at: batch.finished_at,
          error_message: batch.error_message
        });
        state.import_runs = state.import_runs.slice(0, MAX_IMPORT_RUNS);
        return batch;
      });
      res.json({ code: 0, message: 'ok', data: result });
    } catch (error) {
      next(error);
    }
  });

  app.get('/imports/latest', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      res.json({ code: 0, message: 'ok', data: state.import_runs[0] || null });
    } catch (error) {
      next(error);
    }
  });

  app.get('/imports/:batchId', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      res.json({ code: 0, message: 'ok', data: state.import_batches[req.params.batchId] || null });
    } catch (error) {
      next(error);
    }
  });

  app.post('/reminder-sends/claim', async (req, res, next) => {
    try {
      const sendKey = String(req.body.send_key || '').trim();
      if (!sendKey) throw createHttpError(422, 'send_key is required');
      const result = await updateState(config.stateFile, (state) => {
        const existing = state.reminder_send_logs.find((item) => item.send_key === sendKey);
        if (existing) return { claimed: false, send: existing };
        const record = Object.assign({}, req.body, {
          send_key: sendKey,
          status: 'attempting',
          sent: false,
          created_at: nowIso(),
          updated_at: nowIso()
        });
        state.reminder_send_logs.unshift(record);
        state.reminder_send_logs = state.reminder_send_logs.slice(0, MAX_SEND_LOGS);
        return { claimed: true, send: record };
      });
      res.json({ code: 0, message: 'ok', data: result });
    } catch (error) {
      next(error);
    }
  });

  app.post('/reminder-sends/complete', async (req, res, next) => {
    try {
      const sendKey = String(req.body.send_key || '').trim();
      if (!sendKey) throw createHttpError(422, 'send_key is required');
      const result = await updateState(config.stateFile, (state) => {
        const record = state.reminder_send_logs.find((item) => item.send_key === sendKey);
        if (!record) throw createHttpError(404, 'reminder send claim not found');
        record.status = req.body.status || (req.body.sent ? 'sent' : 'failed');
        record.sent = Boolean(req.body.sent);
        record.result = req.body.result || null;
        record.error_message = req.body.error_message || '';
        record.updated_at = nowIso();
        const userId = String(record.user_id || req.body.user_id || '');
        const templateId = String(record.template_id || req.body.template_id || '');
        if (userId && templateId && (req.body.consume || req.body.disable)) {
          const subscription = normalizeSubscription(state.subscriptions[userId]);
          if (req.body.disable) subscription.grants[templateId] = 0;
          else subscription.grants[templateId] = Math.max(Number(subscription.grants[templateId] || 0) - 1, 0);
          subscription.remaining_count = Object.values(subscription.grants).reduce((sum, count) => sum + count, 0);
          subscription.enabled = subscription.remaining_count > 0;
          subscription.updated_at = nowIso();
          state.subscriptions[userId] = subscription;
        }
        return record;
      });
      res.json({ code: 0, message: 'ok', data: result });
    } catch (error) {
      next(error);
    }
  });

  app.get('/reminder-sends/latest', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      const record = state.reminder_send_logs.find((item) => !req.query.userId || item.user_id === req.query.userId) || null;
      res.json({ code: 0, message: 'ok', data: record });
    } catch (error) {
      next(error);
    }
  });

  app.use((req, res) => {
    res.status(404).json({ code: 404, message: 'endpoint not found', data: null });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    res.status(status).json({ code: status, message: error.message || 'remote state server error', data: null });
  });

  return app;
}

function startServer(env) {
  const config = readConfig(env || process.env);
  const app = createApp(config);
  const server = app.listen(config.port, config.host, () => {
    console.log(JSON.stringify({
      ok: true,
      service: 'yyt-remote-state',
      host: config.host,
      port: config.port,
      hasToken: Boolean(config.token)
    }));
  });
  return server;
}

if (require.main === module) startServer(process.env);

module.exports = {
  createApp,
  startServer,
  readConfig,
  readState,
  atomicWriteState,
  normalizeState
};
