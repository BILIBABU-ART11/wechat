const mockData = require('../data/mockData');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let state;

function reset() {
  state = {
    users: clone(mockData.users),
    articles: clone(mockData.articles),
    messages: clone(mockData.messages),
    tokenToUserId: {},
    openidToUserId: {},
    pendingBindOpenid: 'mock-openid-anonymous',
    subscriptions: {}
  };

  for (const user of state.users) {
    state.openidToUserId[user.openid] = user.id;
    state.tokenToUserId[`mock-token-${user.id}`] = user.id;
  }
}

reset();

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function openidFromCode(code) {
  return code ? 'mock-openid-dev-user' : 'mock-openid-anonymous';
}

function findUserById(id) {
  return state.users.find((user) => user.id === id) || null;
}

function tokenForUser(user) {
  const token = `mock-token-${user.id}`;
  state.tokenToUserId[token] = user.id;
  return token;
}

function resolveUserByToken(token) {
  const userId = state.tokenToUserId[token];
  return userId ? findUserById(userId) : null;
}

function wechatLogin(code) {
  const openid = openidFromCode(code);
  state.pendingBindOpenid = openid;
  return { token: '', need_bind: true, bind_token: `bind-${Date.now()}`, user: null };
}

function bindAccount(payload) {
  const bindValue = String(payload.bind_value || '').trim();
  if (payload.bind_type !== 'user_id' || !/^\d{6,}$/.test(bindValue)) {
    throw createHttpError(422, '只能使用有效用户ID授权码绑定');
  }
  const existing = state.users.find((item) => item.id === `u_${bindValue}` || item.internal_account === bindValue);
  const user = existing || {
    id: `u_${bindValue}`,
    nickname: '院院通用户',
    internal_account: bindValue,
    role: 'analyst',
    role_name: '分析员',
    department: '招投标提醒组',
    bind_type: 'user_id',
    bound: true,
    permissions: ['article:read', 'article:update', 'message:read']
  };
  user.openid = state.pendingBindOpenid;
  user.bound = true;
  if (!existing) state.users.push(user);
  state.openidToUserId[user.openid] = user.id;
  return { token: tokenForUser(user), user };
}

function getSummary() {
  const highPriority = state.articles.filter((item) => item.ai_score >= 4);
  const activeStatuses = ['pending', 'new', 'evaluating', 'materials', 'submit_due', 'opening', 'follow_up'];
  const pending = state.articles.filter((item) => activeStatuses.includes(item.status));
  return {
    today_new_count: state.articles.length,
    high_priority_count: highPriority.length,
    pending_count: pending.length,
    unread_message_count: state.messages.filter((item) => !item.read).length,
    categories: [
      { name: '待办统计', count: state.articles.length }
    ],
    recent_high_priority: highPriority
      .slice()
      .sort((a, b) => new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime())
      .slice(0, 4)
  };
}

function listArticles(query) {
  let list = state.articles.slice();
  if (query.category && query.category !== '全部' && query.category !== '待办统计') {
    list = list.filter((item) => item.category === query.category);
  }
  if (query.score && query.score !== 'all') list = list.filter((item) => item.ai_score >= Number(query.score));
  if (query.status) list = list.filter((item) => item.status === query.status);
  if (query.keyword) {
    const keyword = String(query.keyword).trim();
    list = list.filter((item) => `${item.title}${item.company}${item.product}${item.ai_summary}`.includes(keyword));
  }
  list.sort((a, b) => new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime());
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.page_size || 20)));
  return {
    items: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    page_size: pageSize
  };
}

function getArticle(id) {
  const article = state.articles.find((item) => item.id === id);
  if (!article) throw createHttpError(404, 'article not found');
  return article;
}

function updateArticleStatus(id, payload) {
  const article = getArticle(id);
  article.status = payload.status || article.status;
  article.comment = payload.comment || article.comment;
  article.updated_at = new Date().toISOString();
  return article;
}

function listMessages() {
  return {
    items: state.messages.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    unread_count: state.messages.filter((item) => !item.read).length
  };
}

function listTodoReminderMessages(userId) {
  const items = state.messages
    .filter((item) => item.type === 'todo_stat_snapshot')
    .filter((item) => !userId || item.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return {
    items,
    unread_count: items.filter((item) => !item.read).length
  };
}

function markMessageRead(id) {
  const message = state.messages.find((item) => item.id === id);
  if (!message) throw createHttpError(404, 'message not found');
  message.read = true;
  return message;
}

function saveSubscription(userId, payload) {
  const stateValue = {
    enabled: Boolean(payload.accepted),
    mock: Boolean(payload.mock),
    template_ids: payload.template_ids || [],
    updated_at: new Date().toISOString()
  };
  state.subscriptions[userId] = stateValue;
  return stateValue;
}

function listReminderRecipients() {
  return state.users
    .map((user) => ({
      user,
      subscription: state.subscriptions[user.id] || null
    }))
    .filter((item) => item.subscription && item.subscription.enabled);
}

function upsertTodoReminderMessages(items, runAt) {
  const messages = [];
  for (const item of items || []) {
    const pendingCount = Number(item.pendingCount || 0);
    if (pendingCount <= 0) continue;
    const message = {
      id: `todo_${item.snapshotDate || 'latest'}_${item.id}`,
      type: 'todo_stat_snapshot',
      title: '待办提醒',
      content: item.content || `${item.userName || '未知用户'} 当前还有 ${pendingCount} 条待办未处理`,
      article_id: item.id,
      user_id: item.userId,
      read: false,
      created_at: runAt || new Date().toISOString()
    };
    const index = state.messages.findIndex((current) => current.id === message.id);
    if (index >= 0) {
      state.messages[index] = Object.assign({}, state.messages[index], message);
    } else {
      state.messages.unshift(message);
    }
    messages.push(message);
  }
  return messages;
}

function createMessageFromFeishuRecord(payload) {
  const message = {
    id: `msg_${Date.now()}`,
    type: 'feishu_tender_progress',
    title: payload.title || '招投标进度提醒',
    content: payload.content || '院院通待办统计快照已更新，请及时查看。',
    article_id: payload.article_id || '',
    read: false,
    created_at: new Date().toISOString()
  };
  state.messages.unshift(message);
  return { received: true, message_created: true, message };
}

module.exports = {
  reset,
  resolveUserByToken,
  wechatLogin,
  bindAccount,
  getSummary,
  listArticles,
  getArticle,
  updateArticleStatus,
  listMessages,
  listTodoReminderMessages,
  markMessageRead,
  saveSubscription,
  listReminderRecipients,
  upsertTodoReminderMessages,
  createMessageFromFeishuRecord
};
