const database = require('./database');
const jsonStateStore = require('./jsonStateStore');
const remoteStateStore = require('./remoteStateStore');

let tablesReady = false;
const memory = {
  users: [],
  subscriptions: {},
  importRuns: [],
  sendLogs: []
};

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function usingMemory() {
  return !database.hasMysqlConfig() && !activeStateStore();
}

function usingJsonState() {
  return !database.hasMysqlConfig() && jsonStateStore.isConfigured();
}

function usingRemoteState() {
  return !database.hasMysqlConfig() && remoteStateStore.isConfigured();
}

function activeStateStore() {
  if (database.hasMysqlConfig()) return null;
  if (remoteStateStore.isConfigured()) return remoteStateStore;
  if (jsonStateStore.isConfigured()) return jsonStateStore;
  return null;
}

function toMysqlDate(value) {
  return value ? new Date(value) : new Date();
}

function createUser(openid, account) {
  const now = new Date().toISOString();
  return {
    id: `u_${account}`,
    openid: String(openid),
    nickname: `院院通用户${account}`,
    internal_account: String(account),
    role: 'viewer',
    role_name: '订阅用户',
    department: '院院通',
    bind_type: 'user_id',
    bound: true,
    permissions: ['article:read', 'message:read'],
    created_at: now,
    updated_at: now
  };
}

function userFromRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    openid: String(row.openid),
    nickname: row.nickname || '院院通用户',
    internal_account: String(row.internal_account || ''),
    role: row.role || 'viewer',
    role_name: row.role_name || '订阅用户',
    department: row.department || '院院通',
    bind_type: 'user_id',
    bound: Boolean(row.bound),
    permissions: ['article:read', 'message:read'],
    created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

function subscriptionFromRow(row) {
  if (!row) {
    return {
      enabled: false,
      mock: false,
      template_ids: [],
      remaining_count: 0,
      updated_at: ''
    };
  }
  return {
    enabled: Boolean(row.enabled),
    mock: Boolean(row.mock),
    template_ids: row.template_ids_json ? JSON.parse(row.template_ids_json) : [],
    remaining_count: Number(row.remaining_count || 0),
    accepted: Boolean(row.accepted),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

async function ensureTables() {
  const pool = database.getPool();
  if (!pool || tablesReady) return pool;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS yyt_users (
      id VARCHAR(80) PRIMARY KEY,
      openid VARCHAR(128) NOT NULL UNIQUE,
      internal_account VARCHAR(80) NOT NULL UNIQUE,
      nickname VARCHAR(160) NOT NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'viewer',
      role_name VARCHAR(80) NOT NULL DEFAULT '订阅用户',
      department VARCHAR(120) NOT NULL DEFAULT '院院通',
      bound TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_yyt_users_openid (openid),
      INDEX idx_yyt_users_internal_account (internal_account)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS yyt_subscriptions (
      user_id VARCHAR(80) PRIMARY KEY,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      accepted TINYINT(1) NOT NULL DEFAULT 0,
      mock TINYINT(1) NOT NULL DEFAULT 0,
      template_ids_json TEXT,
      raw_json TEXT,
      remaining_count INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_yyt_subscriptions_enabled (enabled),
      CONSTRAINT fk_yyt_subscriptions_user FOREIGN KEY (user_id) REFERENCES yyt_users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS yyt_import_runs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      status VARCHAR(20) NOT NULL,
      source VARCHAR(80) NOT NULL,
      imported_count INT NOT NULL DEFAULT 0,
      storage VARCHAR(40) NOT NULL DEFAULT '',
      started_at DATETIME NOT NULL,
      finished_at DATETIME NOT NULL,
      meta_json MEDIUMTEXT,
      error_message TEXT,
      created_at DATETIME NOT NULL,
      INDEX idx_yyt_import_runs_created (created_at),
      INDEX idx_yyt_import_runs_status (status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS yyt_reminder_send_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(80) NOT NULL,
      openid VARCHAR(128) NOT NULL,
      snapshot_id VARCHAR(120) NOT NULL,
      template_id VARCHAR(160) NOT NULL,
      pending_count INT NOT NULL DEFAULT 0,
      sent TINYINT(1) NOT NULL DEFAULT 0,
      mock TINYINT(1) NOT NULL DEFAULT 0,
      result_json MEDIUMTEXT,
      error_message TEXT,
      created_at DATETIME NOT NULL,
      INDEX idx_yyt_send_user_created (user_id, created_at),
      INDEX idx_yyt_send_snapshot (snapshot_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  tablesReady = true;
  return pool;
}

async function findUserByOpenid(openid) {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.findUserByOpenid(openid);
  if (usingMemory()) {
    return memory.users.find((user) => user.openid === openid) || null;
  }
  const pool = await ensureTables();
  const [rows] = await pool.query('SELECT * FROM yyt_users WHERE openid = ? LIMIT 1', [openid]);
  return userFromRow(rows[0]);
}

async function findUserById(id) {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.findUserById(id);
  if (usingMemory()) {
    return memory.users.find((user) => user.id === id) || null;
  }
  const pool = await ensureTables();
  const [rows] = await pool.query('SELECT * FROM yyt_users WHERE id = ? LIMIT 1', [id]);
  return userFromRow(rows[0]);
}

async function bindUser(openid, internalAccount) {
  const account = String(internalAccount || '').trim();
  if (!/^\d{6,}$/.test(account)) {
    throw createHttpError(422, '只能使用有效用户ID授权码绑定');
  }
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.bindUser(openid, account);
  const userId = `u_${account}`;
  if (usingMemory()) {
    const claimed = memory.users.find((user) => user.internal_account === account && user.openid !== openid);
    if (claimed) throw createHttpError(409, '该用户ID已绑定其他微信账号');
    memory.users = memory.users.filter((user) => user.openid !== openid && user.id !== userId);
    const user = createUser(openid, account);
    memory.users.push(user);
    return user;
  }

  const pool = await ensureTables();
  const connection = await pool.getConnection();
  const now = new Date();
  try {
    await connection.beginTransaction();
    const [claimedRows] = await connection.query(
      'SELECT * FROM yyt_users WHERE internal_account = ? LIMIT 1 FOR UPDATE',
      [account]
    );
    if (claimedRows[0] && claimedRows[0].openid !== openid) {
      throw createHttpError(409, '该用户ID已绑定其他微信账号');
    }
    const [openidRows] = await connection.query(
      'SELECT * FROM yyt_users WHERE openid = ? LIMIT 1 FOR UPDATE',
      [openid]
    );
    if (openidRows[0] && openidRows[0].internal_account !== account) {
      await connection.query('DELETE FROM yyt_users WHERE openid = ?', [openid]);
    }
    await connection.query(
      `INSERT INTO yyt_users
        (id, openid, internal_account, nickname, role, role_name, department, bound, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'viewer', '订阅用户', '院院通', 1, ?, ?)
       ON DUPLICATE KEY UPDATE
        openid = VALUES(openid),
        internal_account = VALUES(internal_account),
        bound = 1,
        updated_at = VALUES(updated_at)`,
      [userId, openid, account, `院院通用户${account}`, now, now]
    );
    await connection.commit();
    return findUserById(userId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function saveSubscription(userId, payload) {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.saveSubscription(userId, payload);
  const accepted = Boolean(payload.accepted);
  const templateIds = Array.isArray(payload.template_ids) ? payload.template_ids : [];
  const raw = payload.raw || payload.error || null;
  const nowIso = new Date().toISOString();
  if (usingMemory()) {
    const current = memory.subscriptions[userId] || { remaining_count: 0 };
    memory.subscriptions[userId] = {
      enabled: accepted,
      accepted,
      mock: Boolean(payload.mock),
      template_ids: templateIds,
      raw,
      remaining_count: accepted ? Number(current.remaining_count || 0) + 1 : 0,
      updated_at: nowIso
    };
    return getSubscription(userId);
  }

  const pool = await ensureTables();
  const now = new Date();
  await pool.query(
    `INSERT INTO yyt_subscriptions
      (user_id, enabled, accepted, mock, template_ids_json, raw_json, remaining_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      enabled = VALUES(enabled),
      accepted = VALUES(accepted),
      mock = VALUES(mock),
      template_ids_json = VALUES(template_ids_json),
      raw_json = VALUES(raw_json),
      remaining_count = CASE WHEN VALUES(accepted) = 1 THEN remaining_count + 1 ELSE 0 END,
      updated_at = VALUES(updated_at)`,
    [
      userId,
      accepted ? 1 : 0,
      accepted ? 1 : 0,
      payload.mock ? 1 : 0,
      JSON.stringify(templateIds),
      JSON.stringify(raw),
      accepted ? 1 : 0,
      now,
      now
    ]
  );
  return getSubscription(userId);
}

async function getSubscription(userId) {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.getSubscription(userId);
  if (usingMemory()) {
    return memory.subscriptions[userId] || {
      enabled: false,
      mock: false,
      template_ids: [],
      remaining_count: 0,
      updated_at: ''
    };
  }
  const pool = await ensureTables();
  const [rows] = await pool.query('SELECT * FROM yyt_subscriptions WHERE user_id = ? LIMIT 1', [userId]);
  return subscriptionFromRow(rows[0]);
}

async function listReminderRecipients() {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.listReminderRecipients();
  if (usingMemory()) {
    return memory.users
      .map((user) => ({ user, subscription: memory.subscriptions[user.id] || null }))
      .filter((item) => item.subscription && item.subscription.enabled && Number(item.subscription.remaining_count || 0) > 0);
  }
  const pool = await ensureTables();
  const [rows] = await pool.query(`
    SELECT u.*, s.enabled, s.accepted, s.mock, s.template_ids_json, s.remaining_count, s.updated_at AS subscription_updated_at
      FROM yyt_users u
      INNER JOIN yyt_subscriptions s ON s.user_id = u.id
     WHERE s.enabled = 1 AND s.remaining_count > 0
  `);
  return rows.map((row) => ({
    user: userFromRow(row),
    subscription: {
      enabled: Boolean(row.enabled),
      accepted: Boolean(row.accepted),
      mock: Boolean(row.mock),
      template_ids: row.template_ids_json ? JSON.parse(row.template_ids_json) : [],
      remaining_count: Number(row.remaining_count || 0),
      updated_at: row.subscription_updated_at ? new Date(row.subscription_updated_at).toISOString() : ''
    }
  }));
}

async function consumeSubscription(userId) {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.consumeSubscription(userId);
  if (usingMemory()) {
    const current = memory.subscriptions[userId];
    if (!current) return;
    current.remaining_count = Math.max(Number(current.remaining_count || 0) - 1, 0);
    current.enabled = current.remaining_count > 0;
    current.updated_at = new Date().toISOString();
    return;
  }
  const pool = await ensureTables();
  await pool.query(
    `UPDATE yyt_subscriptions
        SET enabled = CASE WHEN GREATEST(remaining_count - 1, 0) <= 0 THEN 0 ELSE enabled END,
            remaining_count = GREATEST(remaining_count - 1, 0),
            updated_at = ?
      WHERE user_id = ?`,
    [new Date(), userId]
  );
}

async function recordImportRun(payload) {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.recordImportRun(payload);
  const record = {
    status: payload.status || 'success',
    source: payload.source || 'todo-stat-snapshots',
    imported_count: Number(payload.imported_count || 0),
    storage: payload.storage || '',
    started_at: (payload.started_at ? new Date(payload.started_at) : new Date()).toISOString(),
    finished_at: (payload.finished_at ? new Date(payload.finished_at) : new Date()).toISOString(),
    meta: payload.meta || null,
    error_message: payload.error_message || ''
  };
  if (usingMemory()) {
    memory.importRuns.unshift(record);
    memory.importRuns = memory.importRuns.slice(0, 20);
    return;
  }
  const pool = await ensureTables();
  await pool.query(
    `INSERT INTO yyt_import_runs
      (status, source, imported_count, storage, started_at, finished_at, meta_json, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.status,
      record.source,
      record.imported_count,
      record.storage,
      toMysqlDate(record.started_at),
      toMysqlDate(record.finished_at),
      JSON.stringify(record.meta),
      record.error_message,
      new Date()
    ]
  );
}

async function getLastImportRun() {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.getLastImportRun();
  if (usingMemory()) return memory.importRuns[0] || null;
  const pool = await ensureTables();
  const [rows] = await pool.query('SELECT * FROM yyt_import_runs ORDER BY id DESC LIMIT 1');
  const row = rows[0];
  if (!row) return null;
  return {
    status: row.status,
    source: row.source,
    imported_count: Number(row.imported_count || 0),
    storage: row.storage,
    started_at: row.started_at ? new Date(row.started_at).toISOString() : '',
    finished_at: row.finished_at ? new Date(row.finished_at).toISOString() : '',
    error_message: row.error_message || ''
  };
}

async function recordReminderSend(payload) {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.recordReminderSend(payload);
  const record = {
    user_id: payload.user_id,
    openid: payload.openid,
    snapshot_id: payload.snapshot_id,
    template_id: payload.template_id || '',
    pending_count: Number(payload.pending_count || 0),
    sent: Boolean(payload.sent),
    mock: Boolean(payload.mock),
    result: payload.result || null,
    error_message: payload.error_message || '',
    created_at: new Date().toISOString()
  };
  if (usingMemory()) {
    memory.sendLogs.unshift(record);
    memory.sendLogs = memory.sendLogs.slice(0, 50);
    return;
  }
  const pool = await ensureTables();
  await pool.query(
    `INSERT INTO yyt_reminder_send_logs
      (user_id, openid, snapshot_id, template_id, pending_count, sent, mock, result_json, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.user_id,
      record.openid,
      record.snapshot_id,
      record.template_id,
      record.pending_count,
      record.sent ? 1 : 0,
      record.mock ? 1 : 0,
      JSON.stringify(record.result),
      record.error_message,
      new Date()
    ]
  );
}

async function getLastReminderSend(userId) {
  const stateStore = activeStateStore();
  if (stateStore) return stateStore.getLastReminderSend(userId);
  if (usingMemory()) {
    return memory.sendLogs.find((item) => !userId || item.user_id === userId) || null;
  }
  const pool = await ensureTables();
  const values = [];
  let where = '';
  if (userId) {
    where = 'WHERE user_id = ?';
    values.push(userId);
  }
  const [rows] = await pool.query(
    `SELECT * FROM yyt_reminder_send_logs ${where} ORDER BY id DESC LIMIT 1`,
    values
  );
  const row = rows[0];
  if (!row) return null;
  return {
    user_id: row.user_id,
    snapshot_id: row.snapshot_id,
    template_id: row.template_id,
    pending_count: Number(row.pending_count || 0),
    sent: Boolean(row.sent),
    mock: Boolean(row.mock),
    error_message: row.error_message || '',
    created_at: row.created_at ? new Date(row.created_at).toISOString() : ''
  };
}

module.exports = {
  ensureTables,
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
  getLastReminderSend,
  usingMemory,
  usingJsonState,
  usingRemoteState,
  createUser
};
