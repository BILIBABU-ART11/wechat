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
process.env.SUBSCRIBE_TEMPLATE_IDS = 'unused-template-id,test-template-id';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_FIELDS = '{"title":"thing1","count":"number2","content":"thing3","date":"date4"}';
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
  const authService = require('../src/services/authService');

  try {
    assert.strictEqual(accountStore.usingRemoteState(), true);
    assert.strictEqual(accountStore.usingMemory(), false);

    const user = await accountStore.bindUser('openid-remote-state', '2234567890');
    assert.strictEqual(user.internal_account, '2234567890');

    const subscription = await accountStore.saveSubscription(user.id, {
      request_id: 'subscription-request-1',
      accepted: true,
      accepted_template_ids: ['test-template-id'],
      mock: true,
      template_ids: ['test-template-id']
    });
    assert.strictEqual(subscription.enabled, true);
    assert.strictEqual(subscription.remaining_count, 1);
    await assert.rejects(
      () => accountStore.saveSubscription(user.id, {
        request_id: 'subscription-request-1',
        accepted: true,
        accepted_template_ids: ['test-template-id'],
        template_ids: ['test-template-id']
      }),
      (error) => error.status === 409
    );

    const accessToken = authService.accessTokenForUser(user);
    const tokenPayload = JSON.parse(Buffer.from(accessToken.split('.')[0], 'base64url').toString('utf8'));
    assert.strictEqual(tokenPayload.user_id, user.id);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(tokenPayload, 'openid'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(tokenPayload, 'internal_account'), false);
    const missingToken = authService.accessTokenForUser({ id: 'u_missing' });
    assert.strictEqual(await authService.resolveUserByToken(missingToken), null);

    const importResult = await todoStatService.importSnapshots({
      imported_at: '2026-07-28T17:20:00+08:00',
      items: [{
        id: 'remote-todo-1',
        snapshotDate: '2026-07-28',
        userId: '2234567890',
        userName: 'Remote User',
        pendingCount: 2,
        content: '2 pending todos'
      }, {
        id: 'remote-todo-2',
        snapshotDate: '2026-07-28',
        userId: '2234567890',
        userName: 'Remote User',
        pendingCount: 1,
        content: 'one more pending todo'
      }]
    });
    assert.strictEqual(importResult.storage, 'remote-json');
    assert.strictEqual(importResult.imported_count, 2);


    const list = await todoStatService.listSnapshots({ userId: '2234567890' });
    assert.strictEqual(list.total, 2);
    assert.strictEqual(list.source, 'remote-json-import');

    const reminderRun = await reminderJobService.processReminderBatch(importResult.batch_id, 'remote-test');
    assert.strictEqual(reminderRun.sent_count, 1);
    const duplicateRun = await reminderJobService.processReminderBatch(importResult.batch_id, 'remote-test');
    assert.strictEqual(duplicateRun.skipped, true);

    const afterSend = await accountStore.getSubscription(user.id);
    assert.strictEqual(afterSend.remaining_count, 0);
    assert.strictEqual(afterSend.enabled, false);

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(state.users.length, 1);
    assert.strictEqual(state.todo_snapshots.items.length, 2);
    assert.strictEqual(state.reminder_send_logs.length, 1);
    assert.strictEqual(state.reminder_send_logs[0].template_id, 'test-template-id');

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
