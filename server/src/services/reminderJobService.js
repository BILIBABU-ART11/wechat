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
    total: articles.total
  };
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

function matchRecipients(item, recipients) {
  return recipients.filter(({ user }) => {
    if (config.mockMode) {
      const identity = `${user.id}${user.nickname}${user.internal_account}${user.openid}`;
      return !item.userId || identity.includes(item.userId) || identity.includes(item.userName || '');
    }
    return String(user.internal_account || '') === String(item.userId || '');
  });
}

function availableGrant(target, templateId) {
  const grants = target.subscription.grants || {};
  if (Object.prototype.hasOwnProperty.call(grants, templateId)) return Number(grants[templateId] || 0);
  return Number(target.subscription.remaining_count || 0);
}

function recalculateLocalSubscription(target) {
  const grants = target.subscription.grants || {};
  target.subscription.remaining_count = Object.values(grants)
    .reduce((sum, count) => sum + Math.max(0, Number(count || 0)), 0);
  target.subscription.enabled = target.subscription.remaining_count > 0;
}

function decrementLocalGrant(target, templateId) {
  if (target.subscription.grants && Object.prototype.hasOwnProperty.call(target.subscription.grants, templateId)) {
    target.subscription.grants[templateId] = Math.max(Number(target.subscription.grants[templateId] || 0) - 1, 0);
    recalculateLocalSubscription(target);
    return;
  }
  target.subscription.remaining_count = Math.max(Number(target.subscription.remaining_count || 0) - 1, 0);
  target.subscription.enabled = target.subscription.remaining_count > 0;
}

function disableLocalGrant(target, templateId) {
  if (target.subscription.grants) target.subscription.grants[templateId] = 0;
  recalculateLocalSubscription(target);
}

function selectTemplateId(target) {
  const configuredIds = subscriptionService.getTemplateIds();
  const subscribedIds = target.subscription.template_ids || [];
  return configuredIds.find((id) => subscribedIds.includes(id) && availableGrant(target, id) > 0)
    || subscribedIds.find((id) => configuredIds.includes(id) && availableGrant(target, id) > 0)
    || '';
}

async function sendReminderForSnapshot(item, recipients, batchId) {
  const pendingCount = Number(item.pendingCount || 0);
  if (config.reminderSchedule.sendOnlyPending && pendingCount <= 0) return [];
  const targets = matchRecipients(item, recipients);
  if (!targets.length) return [];

  const results = [];
  for (const target of targets) {
    const templateId = selectTemplateId(target);
    if (!templateId || availableGrant(target, templateId) <= 0) continue;
    const sendKey = [batchId || 'manual', target.user.id, item.id, templateId].join(':');
    const claim = config.mockMode
      ? { claimed: true }
      : await accountStore.claimReminderSend({
        send_key: sendKey,
        batch_id: batchId,
        user_id: target.user.id,
        openid: target.user.openid,
        snapshot_id: item.id,
        template_id: templateId,
        pending_count: pendingCount
      });
    if (!claim.claimed) {
      results.push({ sent: false, skipped: true, reason: 'send already claimed', send_key: sendKey });
      continue;
    }

    let result;
    try {
      result = await subscriptionService.sendSubscribeMessage({
        openid: target.user.openid,
        mock: target.subscription.mock,
        template_id: templateId,
        userName: item.userName,
        pendingCount,
        content: item.content,
        snapshotDate: item.snapshotDate
      });
    } catch (error) {
      result = { sent: false, mock: false, permanent: false, error: error.message };
    }
    results.push(result);

    if (config.mockMode) {
      if (result.sent) {
        store.consumeSubscription(target.user.id);
        decrementLocalGrant(target, templateId);
      }
      continue;
    }

    await accountStore.completeReminderSend({
      send_key: sendKey,
      batch_id: batchId,
      user_id: target.user.id,
      openid: target.user.openid,
      snapshot_id: item.id,
      template_id: templateId,
      pending_count: pendingCount,
      sent: Boolean(result.sent),
      status: result.sent ? 'sent' : (result.permanent ? 'permanent-failure' : 'failed'),
      result,
      error_message: result.error || result.reason || '',
      consume: Boolean(result.sent),
      disable: Boolean(result.permanent)
    });
    if (result.sent) decrementLocalGrant(target, templateId);
    if (result.permanent) disableLocalGrant(target, templateId);
  }
  return results;
}

async function runReminderJob(trigger, options) {
  if (running) return { skipped: true, reason: 'job already running', lastResult };
  running = true;
  const startedAt = new Date().toISOString();
  const batchId = options && options.batchId;
  try {
    const snapshots = await fetchAllSnapshots();
    const pendingSnapshots = snapshots.filter((item) => Number(item.pendingCount || 0) > 0);
    const messages = config.mockMode ? store.upsertTodoReminderMessages(pendingSnapshots, startedAt) : pendingSnapshots;
    const recipients = config.mockMode ? store.listReminderRecipients() : await accountStore.listReminderRecipients();
    const sendResults = [];
    for (const item of pendingSnapshots) {
      sendResults.push(...await sendReminderForSnapshot(item, recipients, batchId));
    }
    lastResult = {
      skipped: false,
      batch_id: batchId || '',
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

async function processReminderBatch(batchId, trigger) {
  if (!batchId) {
    const error = new Error('batch_id is required');
    error.status = 422;
    throw error;
  }
  if (!config.mockMode) await todoStatService.getCurrentImportedBatch(batchId);
  const claim = await accountStore.claimImportBatch(batchId, { source: trigger || 'import' });
  if (!claim.claimed) {
    return {
      skipped: true,
      reason: 'batch already processed or claimed',
      batch_id: batchId,
      batch: claim.batch || null
    };
  }
  try {
    const result = await runReminderJob(trigger, { batchId });
    await accountStore.completeImportBatch(batchId, { status: 'success', result });
    return result;
  } catch (error) {
    await accountStore.completeImportBatch(batchId, {
      status: 'failed',
      error_message: error.message
    }).catch(() => {});
    throw error;
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
  processReminderBatch,
  getStatus,
  todayKey,
  currentTimeText
};
