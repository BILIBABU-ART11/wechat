const request = require('./request');
const {
  normalizeDashboardSummary,
  normalizeArticleListResult,
  normalizeArticle,
  normalizeMessageListResult,
  normalizeMessage,
  normalizeTodoSnapshotListResult
} = require('../utils/normalize');

function getDashboardSummary() {
  return request.get('/api/dashboard/summary').then(normalizeDashboardSummary);
}

function getArticles(params) {
  return request.get('/api/articles', params || {}).then(normalizeArticleListResult);
}

function getArticleDetail(id) {
  return request.get(`/api/articles/${id}`).then(normalizeArticle);
}

function updateArticleStatus(id, payload) {
  return request.patch(`/api/articles/${id}/status`, payload || {}, { showLoading: true }).then(normalizeArticle);
}

function getMessages() {
  return request.get('/api/messages').then(normalizeMessageListResult);
}

function markMessageRead(id) {
  return request.patch(`/api/messages/${id}/read`).then(normalizeMessage);
}

function subscribeReminder(payload) {
  return request.post('/api/subscribe', payload || {}, { showLoading: true });
}

function getSubscribeConfig() {
  return request.get('/api/subscribe/config');
}

function getTodoSnapshots(params) {
  return request.get('/api/todo-stat/snapshots', params || {}).then(normalizeTodoSnapshotListResult);
}

function getReminderStatus() {
  return request.get('/api/reminders/status');
}

function runReminderJob() {
  return request.post('/api/reminders/run', {}, { showLoading: true });
}

module.exports = {
  getDashboardSummary,
  getArticles,
  getArticleDetail,
  updateArticleStatus,
  getMessages,
  markMessageRead,
  subscribeReminder,
  getSubscribeConfig,
  getTodoSnapshots,
  getReminderStatus,
  runReminderJob
};
