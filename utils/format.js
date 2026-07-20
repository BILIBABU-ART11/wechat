const { STATUS_LABELS } = require('./constants');

function pad(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return '--';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function relativeTime(value) {
  const date = parseDate(value);
  if (!date) return '--';
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function statusText(status) {
  return STATUS_LABELS[status] || status || '待关注';
}

function scoreLevel(score) {
  const value = Number(score || 0);
  if (value >= 5) return 'critical';
  if (value >= 4) return 'high';
  if (value >= 3) return 'medium';
  return 'low';
}

module.exports = {
  formatDateTime,
  relativeTime,
  statusText,
  scoreLevel
};
