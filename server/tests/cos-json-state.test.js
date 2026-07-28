const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const stateFile = path.join(os.tmpdir(), `yyt-state-${Date.now()}.json`);

process.env.MOCK_MODE = 'false';
process.env.STORAGE_MODE = 'cos-json';
process.env.COS_STATE_FILE = stateFile;
process.env.TODO_DATA_SOURCE = 'import';
process.env.TODO_IMPORT_TOKEN = 'test-import-token';
process.env.APP_TOKEN_SECRET = 'test-token-secret';
process.env.WECHAT_APP_ID = 'test-app-id';
process.env.WECHAT_APP_SECRET = 'test-app-secret';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID = 'test-template-id';
process.env.REMINDER_SCHEDULE_ENABLED = 'false';
delete process.env.MYSQL_ADDRESS;
delete process.env.MYSQL_USERNAME;
delete process.env.MYSQL_PASSWORD;

const accountStore = require('../src/services/accountStore');
const todoStatService = require('../src/services/todoStatService');
const reminderJobService = require('../src/services/reminderJobService');

async function run() {
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);

  assert.strictEqual(accountStore.usingJsonState(), true);
  assert.strictEqual(accountStore.usingMemory(), false);

  const user = await accountStore.bindUser('openid-json-state', '1234567890');
  assert.strictEqual(user.internal_account, '1234567890');

  const subscription = await accountStore.saveSubscription(user.id, {
    accepted: true,
    mock: true,
    template_ids: ['test-template-id'],
    raw: { test: true }
  });
  assert.strictEqual(subscription.enabled, true);
  assert.strictEqual(subscription.remaining_count, 1);

  const importResult = await todoStatService.importSnapshots({
    imported_at: '2026-07-28T09:20:00+08:00',
    items: [{
      id: 'todo-1',
      snapshotDate: '2026-07-28',
      userId: '1234567890',
      userName: 'Test User',
      pendingCount: 3,
      content: '3 pending todos'
    }, {
      id: 'todo-2',
      snapshotDate: '2026-07-28',
      userId: '9999999999',
      userName: 'Other User',
      pendingCount: 5,
      content: 'other user data'
    }]
  });
  assert.strictEqual(importResult.storage, 'cos-json');
  assert.strictEqual(importResult.imported_count, 2);

  await accountStore.recordImportRun({
    status: 'success',
    source: 'test',
    imported_count: importResult.imported_count,
    storage: importResult.storage,
    started_at: '2026-07-28T09:20:00+08:00',
    finished_at: '2026-07-28T09:20:01+08:00'
  });

  const list = await todoStatService.listSnapshots({ userId: '1234567890', page: 1, pageSize: 10 });
  assert.strictEqual(list.total, 1);
  assert.strictEqual(list.items[0].id, 'todo-1');
  assert.strictEqual(list.source, 'cos-json-import');

  const reminderRun = await reminderJobService.runReminderJob('test-import');
  assert.strictEqual(reminderRun.sent_count, 1);

  const afterSend = await accountStore.getSubscription(user.id);
  assert.strictEqual(afterSend.remaining_count, 0);
  assert.strictEqual(afterSend.enabled, false);

  const lastImport = await accountStore.getLastImportRun();
  assert.strictEqual(lastImport.storage, 'cos-json');

  const lastSend = await accountStore.getLastReminderSend(user.id);
  assert.strictEqual(lastSend.sent, true);
  assert.strictEqual(lastSend.snapshot_id, 'todo-1');

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.strictEqual(state.users.length, 1);
  assert.strictEqual(state.todo_snapshots.items.length, 2);

  fs.unlinkSync(stateFile);
  console.log('COS JSON state tests passed.');
}

run().catch((error) => {
  try {
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  } catch (_) {
    // ignore cleanup failures in test exit path
  }
  console.error(error);
  process.exit(1);
});
