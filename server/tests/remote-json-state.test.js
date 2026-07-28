const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../../scripts/remote-state-server');

const token = 'test-remote-state-token';
const stateFile = path.join(os.tmpdir(), `yyt-remote-state-${Date.now()}.json`);

process.env.MOCK_MODE = 'false';
process.env.STORAGE_MODE = 'remote-json';
process.env.TODO_DATA_SOURCE = 'import';
process.env.REMINDER_SCHEDULE_ENABLED = 'false';
process.env.TODO_IMPORT_TOKEN = 'test-import-token';
process.env.APP_TOKEN_SECRET = 'test-token-secret';
process.env.WECHAT_APP_ID = 'test-app-id';
process.env.WECHAT_APP_SECRET = 'test-app-secret';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID = 'test-template-id';
process.env.REMOTE_STATE_TOKEN = token;
delete process.env.MYSQL_ADDRESS;
delete process.env.MYSQL_USERNAME;
delete process.env.MYSQL_PASSWORD;

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function run() {
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  const remoteServer = await listen(createApp({ token, stateFile }));
  process.env.REMOTE_STATE_API_BASE_URL = `http://127.0.0.1:${remoteServer.address().port}`;

  const accountStore = require('../src/services/accountStore');
  const todoStatService = require('../src/services/todoStatService');
  const reminderJobService = require('../src/services/reminderJobService');

  try {
    assert.strictEqual(accountStore.usingRemoteState(), true);
    assert.strictEqual(accountStore.usingMemory(), false);

    const user = await accountStore.bindUser('openid-remote-state', '2234567890');
    assert.strictEqual(user.internal_account, '2234567890');

    const subscription = await accountStore.saveSubscription(user.id, {
      accepted: true,
      mock: true,
      template_ids: ['test-template-id']
    });
    assert.strictEqual(subscription.enabled, true);
    assert.strictEqual(subscription.remaining_count, 1);

    const importResult = await todoStatService.importSnapshots({
      imported_at: '2026-07-28T17:20:00+08:00',
      items: [{
        id: 'remote-todo-1',
        snapshotDate: '2026-07-28',
        userId: '2234567890',
        userName: 'Remote User',
        pendingCount: 2,
        content: '2 pending todos'
      }]
    });
    assert.strictEqual(importResult.storage, 'remote-json');
    assert.strictEqual(importResult.imported_count, 1);

    await accountStore.recordImportRun({
      status: 'success',
      source: 'remote-test',
      imported_count: importResult.imported_count,
      storage: importResult.storage
    });

    const list = await todoStatService.listSnapshots({ userId: '2234567890' });
    assert.strictEqual(list.total, 1);
    assert.strictEqual(list.source, 'remote-json-import');

    const reminderRun = await reminderJobService.runReminderJob('remote-test');
    assert.strictEqual(reminderRun.sent_count, 1);

    const afterSend = await accountStore.getSubscription(user.id);
    assert.strictEqual(afterSend.remaining_count, 0);
    assert.strictEqual(afterSend.enabled, false);

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(state.users.length, 1);
    assert.strictEqual(state.todo_snapshots.items.length, 1);
    assert.strictEqual(state.reminder_send_logs.length, 1);

    console.log('Remote JSON state tests passed.');
  } finally {
    await close(remoteServer);
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
