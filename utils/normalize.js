const {
  formatDateTime,
  relativeTime
} = require('./format');

function normalizeArticle(article) {
  if (!article) return article;
  return Object.assign({}, article, {
    ai_score: Number(article.ai_score || 0),
    status: article.status || '',
    display_summary: article.reminder_reason || article.ai_summary || '',
    publish_time_text: formatDateTime(article.publish_time),
    publish_time_relative: relativeTime(article.publish_time),
    deadline_text: formatDateTime(article.deadline),
    deadline_relative: relativeTime(article.deadline),
    updated_at_text: formatDateTime(article.updated_at),
    source_url_text: article.original_url || '来源为院院通接口快照'
  });
}

function normalizeArticles(articles) {
  return (articles || []).map(normalizeArticle);
}

function normalizeDashboardSummary(summary) {
  if (!summary) return summary;
  return Object.assign({}, summary, {
    recent_high_priority: normalizeArticles(summary.recent_high_priority)
  });
}

function normalizeArticleListResult(result) {
  if (!result) return result;
  return Object.assign({}, result, {
    items: normalizeArticles(result.items)
  });
}

function normalizeMessage(message) {
  if (!message) return message;
  return Object.assign({}, message, {
    created_at_text: formatDateTime(message.created_at),
    created_at_relative: relativeTime(message.created_at)
  });
}

function normalizeMessageListResult(result) {
  if (!result) return result;
  return Object.assign({}, result, {
    items: (result.items || []).map(normalizeMessage)
  });
}

function normalizeTodoSnapshot(snapshot) {
  if (!snapshot) return snapshot;
  return Object.assign({}, snapshot, {
    snapshot_date_text: snapshot.snapshotDate || ''
  });
}

function normalizeTodoSnapshotListResult(result) {
  if (!result) return result;
  return Object.assign({}, result, {
    items: (result.items || []).map(normalizeTodoSnapshot)
  });
}

module.exports = {
  normalizeArticle,
  normalizeDashboardSummary,
  normalizeArticleListResult,
  normalizeMessage,
  normalizeMessageListResult,
  normalizeTodoSnapshot,
  normalizeTodoSnapshotListResult
};
