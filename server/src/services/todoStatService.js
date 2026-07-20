const fs = require('fs');
const config = require('../config');

function createHttpError(status, message, cause) {
  const error = new Error(message);
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function assertConfigured() {
  if (!config.todoApi.apiKey) {
    throw createHttpError(500, 'TODO_API_KEY is not configured');
  }
}

function buildUrl(path, params) {
  const baseUrl = config.todoApi.baseUrl.endsWith('/')
    ? config.todoApi.baseUrl
    : `${config.todoApi.baseUrl}/`;
  const url = new URL(path.replace(/^\//, ''), baseUrl);
  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

function normalizePageQuery(query) {
  return {
    page: Math.max(1, Number(query.page || 1)),
    pageSize: Math.min(100, Math.max(1, Number(query.pageSize || query.page_size || 20))),
    snapshotDate: query.snapshotDate || query.snapshot_date || ''
  };
}

function normalizeItems(items, userId) {
  const normalized = (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item.id || ''),
    snapshotDate: String(item.snapshotDate || ''),
    userId: String(item.userId || ''),
    userName: String(item.userName || ''),
    pendingCount: Number(item.pendingCount || 0),
    content: String(item.content || '')
  })).filter((item) => item.id && item.userId);
  if (!userId) return normalized;
  return normalized.filter((item) => item.userId === String(userId));
}

function paginate(items, page, pageSize) {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

function readLocalSnapshotFile(params) {
  if (config.todoApi.dataSource !== 'file' && config.todoApi.dataSource !== 'auto') return null;
  if (!config.todoApi.dataFile || !fs.existsSync(config.todoApi.dataFile)) return null;
  const text = fs.readFileSync(config.todoApi.dataFile, 'utf8').replace(/^\uFEFF/, '');
  const raw = JSON.parse(text);
  const source = raw.data || raw;
  const items = normalizeItems(source.items, params.userId);
  return {
    items: paginate(items, params.page, params.pageSize),
    total: items.length,
    page: params.page,
    pageSize: params.pageSize,
    source: 'file'
  };
}

async function requestJson(path, params) {
  assertConfigured();
  if (typeof fetch !== 'function') {
    throw createHttpError(500, 'Current Node.js runtime does not support fetch');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.todoApi.timeoutMs);
  try {
    const response = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.todoApi.apiKey}`
      },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (payload && payload.error && payload.error.message)
        || (payload && payload.error_msg)
        || `Todo API request failed with status ${response.status}`;
      throw createHttpError(response.status, message);
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createHttpError(504, 'Todo API request timed out', error);
    }
    if (error.status) throw error;
    throw createHttpError(502, error.message || 'Todo API request failed', error);
  } finally {
    clearTimeout(timeout);
  }
}

function priorityFromPendingCount(count) {
  if (count >= 40) return 5;
  if (count >= 20) return 4;
  if (count >= 10) return 3;
  if (count > 0) return 2;
  return 1;
}

function dateTimeFromSnapshotDate(snapshotDate, fallback) {
  const date = snapshotDate || fallback || new Date().toISOString().slice(0, 10);
  return `${date}T23:59:59+08:00`;
}

function snapshotToArticle(item) {
  const pendingCount = Number(item.pendingCount || 0);
  return {
    id: item.id,
    record_id: item.id,
    user_id: item.userId,
    snapshot_date: item.snapshotDate,
    title: `${item.userName || '未知用户'} 待办提醒`,
    source: '院院通销售管理系统',
    original_url: '',
    company: item.userName || '',
    product: `${pendingCount} 条待办`,
    category: '待办统计',
    ai_score: priorityFromPendingCount(pendingCount),
    ai_summary: item.content || `当前还有 ${pendingCount} 条待办未处理`,
    publish_time: dateTimeFromSnapshotDate(item.snapshotDate),
    deadline: dateTimeFromSnapshotDate(item.snapshotDate),
    status: pendingCount > 0 ? 'pending' : 'completed',
    owner: item.userName || '',
    comment: item.content || '',
    reminder_reason: item.content || `当前还有 ${pendingCount} 条待办未处理`,
    procurement_unit: '院院通销售管理系统',
    updated_at: dateTimeFromSnapshotDate(item.snapshotDate)
  };
}

function snapshotToMessage(item) {
  const article = snapshotToArticle(item);
  return {
    id: `todo_msg_${item.id}`,
    type: 'todo_stat_snapshot',
    title: '待办提醒',
    content: item.content || `${item.userName || '未知用户'} 当前还有 ${Number(item.pendingCount || 0)} 条待办未处理`,
    article_id: article.id,
    user_id: item.userId,
    read: Number(item.pendingCount || 0) <= 0,
    created_at: article.updated_at
  };
}

function filterArticles(articles, query) {
  let list = articles.slice();
  if (query.category && query.category !== '全部') {
    list = list.filter((item) => item.category === query.category);
  }
  if (query.score && query.score !== 'all') {
    list = list.filter((item) => item.ai_score >= Number(query.score));
  }
  if (query.status) {
    list = list.filter((item) => item.status === query.status);
  }
  if (query.keyword) {
    const keyword = String(query.keyword).trim();
    list = list.filter((item) => `${item.title}${item.company}${item.product}${item.ai_summary}`.includes(keyword));
  }
  return list;
}

async function listSnapshots(query) {
  const params = normalizePageQuery(query || {});
  params.userId = query && (query.userId || query.user_id);
  const localResult = readLocalSnapshotFile(params);
  if (localResult) return localResult;
  const payload = await requestJson('/openapi/todo-stat/snapshots', params);
  const items = normalizeItems(payload.items, params.userId);
  return {
    items,
    total: params.userId ? items.length : Number(payload.total || 0),
    page: Number(payload.page || params.page),
    pageSize: Number(payload.pageSize || params.pageSize)
  };
}

async function listAllSnapshots(query) {
  const pageSize = Math.min(100, Math.max(1, Number((query && (query.pageSize || query.page_size)) || 100)));
  const snapshotDate = query && (query.snapshotDate || query.snapshot_date);
  const userId = query && (query.userId || query.user_id);
  const allItems = [];
  let page = 1;
  let total = 0;
  do {
    const result = await listSnapshots({ page, pageSize, snapshotDate, userId });
    allItems.push(...result.items);
    total = Number(result.total || allItems.length);
    if (!result.items.length) break;
    page += 1;
  } while (allItems.length < total);
  return {
    items: allItems,
    total: total || allItems.length,
    page: 1,
    pageSize
  };
}

async function listArticles(query) {
  const q = query || {};
  const hasLocalFilters = Boolean(
    (q.category && q.category !== '全部' && q.category !== '待办统计')
    || (q.score && q.score !== 'all')
    || q.status
    || q.keyword
  );
  const page = Math.max(1, Number(q.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize || q.page_size || 20)));
  const result = hasLocalFilters
    ? await listAllSnapshots(Object.assign({}, q, { pageSize: 100 }))
    : await listSnapshots(q);
  const articles = filterArticles(result.items.map(snapshotToArticle), q);
  return {
    items: hasLocalFilters ? articles.slice((page - 1) * pageSize, page * pageSize) : articles,
    total: hasLocalFilters ? articles.length : result.total,
    page,
    page_size: pageSize
  };
}

async function getArticle(id, userId) {
  const result = await listAllSnapshots({ pageSize: 100, userId });
  const item = result.items.find((snapshot) => snapshot.id === id);
  if (!item) throw createHttpError(404, 'todo snapshot not found');
  return snapshotToArticle(item);
}

async function getSummary(userId) {
  const result = await listAllSnapshots({ pageSize: 100, userId });
  const articles = result.items.map(snapshotToArticle);
  const pending = articles.filter((item) => item.status !== 'completed');
  const highPriority = articles.filter((item) => item.ai_score >= 4);
  return {
    today_new_count: articles.length,
    high_priority_count: highPriority.length,
    pending_count: pending.length,
    unread_message_count: pending.length,
    categories: [
      { name: '待办统计', count: articles.length }
    ],
    recent_high_priority: highPriority.length ? highPriority.slice(0, 4) : articles.slice(0, 4)
  };
}

async function listMessages(query) {
  const result = await listAllSnapshots(Object.assign({ pageSize: 100 }, query || {}));
  const messages = result.items.map(snapshotToMessage);
  return {
    items: messages,
    unread_count: messages.filter((item) => !item.read).length
  };
}

module.exports = {
  listSnapshots,
  listAllSnapshots,
  listArticles,
  getArticle,
  getSummary,
  listMessages,
  snapshotToArticle,
  snapshotToMessage
};
