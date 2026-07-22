const config = require('../config');

let memoryItems = [];
let memoryImportedAt = '';
let pool = null;
let tableReady = false;

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item.id || ''),
    snapshotDate: String(item.snapshotDate || item.snapshot_date || ''),
    userId: String(item.userId || item.user_id || ''),
    userName: String(item.userName || item.user_name || ''),
    pendingCount: Number(item.pendingCount || item.pending_count || 0),
    content: String(item.content || '')
  })).filter((item) => item.id && item.userId);
}

function hasMysqlConfig() {
  return Boolean(config.mysql.host && config.mysql.user && config.mysql.password);
}

function getPool() {
  if (!hasMysqlConfig()) return null;
  if (pool) return pool;
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    waitForConnections: true,
    connectionLimit: 4,
    charset: 'utf8mb4'
  });
  return pool;
}

async function ensureTable() {
  const currentPool = getPool();
  if (!currentPool || tableReady) return currentPool;
  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS todo_snapshots_imported (
      id VARCHAR(80) PRIMARY KEY,
      snapshot_date VARCHAR(20) NOT NULL,
      user_id VARCHAR(80) NOT NULL,
      user_name VARCHAR(160) NOT NULL,
      pending_count INT NOT NULL DEFAULT 0,
      content TEXT,
      imported_at DATETIME NOT NULL,
      INDEX idx_todo_import_user (user_id),
      INDEX idx_todo_import_date (snapshot_date)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  tableReady = true;
  return currentPool;
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
    pageSize,
    source: hasMysqlConfig() ? 'mysql-import' : 'memory-import',
    imported_at: memoryImportedAt
  };
}

async function saveSnapshots(items, importedAt) {
  const normalized = normalizeItems(items);
  const currentImportedAt = importedAt || new Date().toISOString();
  memoryItems = normalized;
  memoryImportedAt = currentImportedAt;

  const currentPool = await ensureTable();
  if (!currentPool) {
    return {
      imported_count: normalized.length,
      storage: 'memory',
      imported_at: currentImportedAt
    };
  }

  const connection = await currentPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM todo_snapshots_imported');
    if (normalized.length) {
      await connection.query(
        `INSERT INTO todo_snapshots_imported
          (id, snapshot_date, user_id, user_name, pending_count, content, imported_at)
         VALUES ?`,
        [normalized.map((item) => [
          item.id,
          item.snapshotDate,
          item.userId,
          item.userName,
          item.pendingCount,
          item.content,
          new Date(currentImportedAt)
        ])]
      );
    }
    await connection.commit();
    return {
      imported_count: normalized.length,
      storage: 'mysql',
      imported_at: currentImportedAt
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listSnapshots(query) {
  const currentPool = await ensureTable();
  if (!currentPool) return filterAndPage(memoryItems, query || {});

  const q = query || {};
  const page = Math.max(1, Number(q.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize || q.page_size || 20)));
  const filters = [];
  const values = [];
  const userId = q.userId || q.user_id || '';
  const snapshotDate = q.snapshotDate || q.snapshot_date || '';
  if (userId) {
    filters.push('user_id = ?');
    values.push(String(userId));
  }
  if (snapshotDate) {
    filters.push('snapshot_date = ?');
    values.push(String(snapshotDate));
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const [countRows] = await currentPool.query(`SELECT COUNT(*) AS total FROM todo_snapshots_imported ${where}`, values);
  const [rows] = await currentPool.query(
    `SELECT id, snapshot_date, user_id, user_name, pending_count, content, imported_at
       FROM todo_snapshots_imported
       ${where}
       ORDER BY pending_count DESC, user_name ASC
       LIMIT ? OFFSET ?`,
    values.concat([pageSize, (page - 1) * pageSize])
  );
  return {
    items: rows.map((row) => ({
      id: String(row.id),
      snapshotDate: String(row.snapshot_date || ''),
      userId: String(row.user_id || ''),
      userName: String(row.user_name || ''),
      pendingCount: Number(row.pending_count || 0),
      content: String(row.content || '')
    })),
    total: Number((countRows[0] && countRows[0].total) || 0),
    page,
    pageSize,
    source: 'mysql-import',
    imported_at: rows[0] && rows[0].imported_at ? new Date(rows[0].imported_at).toISOString() : ''
  };
}

module.exports = {
  saveSnapshots,
  listSnapshots,
  normalizeItems
};
