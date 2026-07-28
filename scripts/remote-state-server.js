#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const express = require('express');

const MAX_IMPORT_RUNS = 20;
const MAX_SEND_LOGS = 50;

let writeQueue = Promise.resolve();

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

async function readState(stateFile) {
  try {
    const text = await fs.readFile(stateFile, 'utf8');
    return normalizeState(JSON.parse(text.replace(/^\uFEFF/, '')));
  } catch (error) {
    if (error.code === 'ENOENT') return defaultState();
    throw error;
  }
}

async function writeState(stateFile, state) {
  const normalized = normalizeState(state);
  normalized.updated_at = nowIso();
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

function updateState(stateFile, mutator) {
  const next = writeQueue.then(async () => {
    const state = await readState(stateFile);
    const result = await mutator(state);
    const saved = await writeState(stateFile, state);
    return result === undefined ? saved : result;
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
    const header = req.headers.authorization || '';
    const bearer = header.replace(/^Bearer\s+/i, '').trim();
    if (bearer !== token) {
      res.status(401).json({ code: 401, message: 'invalid remote state token', data: null });
      return;
    }
    next();
  };
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
          state_file: config.stateFile,
          updated_at: state.updated_at,
          user_count: state.users.length,
          snapshot_count: state.todo_snapshots.items.length
        }
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message, data: null });
    }
  });

  app.use(authMiddleware(config.token));

  app.get('/state', async (req, res, next) => {
    try {
      res.json({ code: 0, message: 'ok', data: await readState(config.stateFile) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/state', async (req, res, next) => {
    try {
      const state = await writeState(config.stateFile, req.body || {});
      res.json({ code: 0, message: 'ok', data: state });
    } catch (error) {
      next(error);
    }
  });

  app.get('/todo/snapshots', async (req, res, next) => {
    try {
      const state = await readState(config.stateFile);
      const data = filterAndPage(state.todo_snapshots.items, req.query || {});
      data.imported_at = state.todo_snapshots.imported_at || '';
      res.json({ code: 0, message: 'ok', data });
    } catch (error) {
      next(error);
    }
  });

  app.post('/todo/snapshots', async (req, res, next) => {
    try {
      const source = req.body && (req.body.data || req.body);
      const items = (Array.isArray(source.items) ? source.items : []).map(normalizeSnapshot).filter(Boolean);
      const importedAt = req.body.imported_at
        || (req.body.meta && (req.body.meta.fetchedAt || req.body.meta.startedAt))
        || nowIso();
      const result = await updateState(config.stateFile, (state) => {
        state.todo_snapshots = {
          items,
          imported_at: importedAt
        };
        return {
          imported_count: items.length,
          storage: 'remote-json',
          imported_at: importedAt
        };
      });
      res.json({ code: 0, message: 'ok', data: result });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
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
      stateFile: config.stateFile,
      hasToken: Boolean(config.token)
    }));
  });
  return server;
}

if (require.main === module) {
  startServer(process.env);
}

module.exports = {
  createApp,
  startServer,
  readConfig,
  readState,
  writeState,
  normalizeState
};
