const config = require('../config');
const store = require('./mockStore');
const todoStatService = require('./todoStatService');
const subscriptionService = require('./subscriptionService');
const accountStore = require('./accountStore');

let running = false;
let lastResult = null;

function timeParts(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.reminderSchedule.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  return parts.reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
}

function todayKey(timeText, now) {
  const parts = timeParts(now);
  return `${parts.year}-${parts.month}-${parts.day} ${timeText}`;
}

function currentTimeText(now) {
  const parts = timeParts(now);
  return `${parts.hour}:${parts.minute}`;
}

async function fetchAllSnapshots() {
  const pageSize = Math.min(100, Math.max(1, config.reminderSchedule.pageSize));
  const allItems = [];
  let page = 1;
  let total = 0;
  do {
    const result = config.mockMode
      ? mockSnapshotPage(page, pageSize)
      : await todoStatService.listSnapshots({ page, pageSize });
    allItems.push(...result.items);
    total = Number(result.total || allItems.length);
    if (!result.items.length) break;
    page += 1;
  } while (allItems.length < total);
  return allItems;
}

function mockSnapshotPage(page, pageSize) {
  const articles = store.listArticles({ page, page_size: pageSize });
  return {
    items: articles.items.map((article) => ({
      id: article.id,
      snapshotDate: (article.updated_at || article.publish_time || '').slice(0, 10),
      userId: article.owner || article.id,
      userName: article.owner || article.company,
      pendingCount: article.ai_score,
      content: article.reminder_reason || article.ai_summary
    })),
    total: articles.total,
    page: articles.page,
    pageSize: articles.page_size
  };
}

function matchRecipients(item, recipients) {
  return recipients.filter(({ user }) => {
    if (config.mockMode) {
      const identity = `${user.id}${user.nickname}${user.internal_account}${user.openid}`;
      return !item.userId || identity.includes(item.userId) || identity.includes(item.userName || '');
    }
    return String(user.internal_account || '') === String(item.userId || '');
  });
}

async function logSendResult(target, item, templateId, result, pendingCount) {
  if (config.mockMode) return;
  await accountStore.recordReminderSend({
    user_id: target.user.id,
    openid: target.user.openid,
    snapshot_id: item.id,
    template_id: templateId,
    pending_count: pendingCount,
    sent: result.sent,
    mock: result.mock,
    result,
    error_message: result.error || result.reason || ''
  });
  if (result.sent) await accountStore.consumeSubscription(target.user.id);
}

async function sendReminderForSnapshot(item, recipients) {
  const pendingCount = Number(item.pendingCount || 0);
  if (config.reminderSchedule.sendOnlyPending && pendingCount <= 0) return [];
  const targets = matchRecipients(item, recipients);
  if (!targets.length) {
    return [{
      sent: false,
      mock: false,
      reason: 'No subscribed user matched this todo snapshot.',
      payload: {
        userId: item.userId,
        userName: item.userName,
        snapshotDate: item.snapshotDate
      }
    }];
  }
  const results = [];
  for (const target of targets) {
    const templateId = (target.subscription.template_ids || [])[0] || config.wechat.subscribeTemplateId;
    try {
      const result = await subscriptionService.sendSubscribeMessage({
        openid: target.user.openid,
        mock: target.subscription.mock,
        template_id: templateId,
        userName: item.userName,
        pendingCount,
        content: item.content,
        snapshotDate: item.snapshotDate
      });
      results.push(result);
      await logSendResult(target, item, templateId, result, pendingCount);
    } catch (error) {
      const result = {
        sent: false,
        mock: false,
        error: error.message,
        payload: {
          openid: target.user.openid,
          userName: item.userName,
          snapshotDate: item.snapshotDate
        }
      };
      results.push(result);
      await logSendResult(target, item, templateId, result, pendingCount);
    }
  }
  return results;
}

async function runReminderJob(trigger) {
  if (running) {
    return {
      skipped: true,
      reason: 'job already running',
      lastResult
    };
  }
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const snapshots = await fetchAllSnapshots();
    const pendingSnapshots = snapshots.filter((item) => Number(item.pendingCount || 0) > 0);
    const messages = config.mockMode ? store.upsertTodoReminderMessages(pendingSnapshots, startedAt) : pendingSnapshots;
    const recipients = config.mockMode ? store.listReminderRecipients() : await accountStore.listReminderRecipients();
    const sendResults = [];
    for (const item of pendingSnapshots) {
      const results = await sendReminderForSnapshot(item, recipients);
      sendResults.push(...results);
    }
    lastResult = {
      skipped: false,
      trigger: trigger || 'manual',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      fetched_count: snapshots.length,
      pending_count: pendingSnapshots.length,
      message_count: messages.length,
      recipient_count: recipients.length,
      sent_count: sendResults.filter((item) => item.sent).length,
      skipped_send_count: sendResults.filter((item) => !item.sent).length
    };
    return lastResult;
  } finally {
    running = false;
  }
}

async function getStatus(userId) {
  const status = {
    running,
    schedule_enabled: config.reminderSchedule.enabled,
    schedule_times: config.reminderSchedule.times,
    time_zone: config.reminderSchedule.timeZone,
    poll_ms: config.reminderSchedule.pollMs,
    data_source: config.todoApi.dataSource,
    last_result: lastResult
  };
  if (!config.mockMode) {
    status.last_import = await accountStore.getLastImportRun();
    status.last_send = await accountStore.getLastReminderSend(userId);
  }
  return status;
}

module.exports = {
  runReminderJob,
  getStatus,
  todayKey,
  currentTimeText
};
