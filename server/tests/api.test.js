const assert = require('assert');
process.env.MOCK_MODE = 'true';
process.env.TODO_IMPORT_TOKEN = 'test-import-token';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID = 'test-template-id';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_FIELDS = '{"title":"thing1","count":"number2","content":"thing3","date":"date4"}';
const app = require('../src/app');
const store = require('../src/services/mockStore');

async function request(baseUrl, method, path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: `Bearer ${token}` } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) {
    throw new Error(`${method} ${path} failed: ${response.status} ${payload.message}`);
  }
  return payload.data;
}

async function requestExpectFailure(baseUrl, method, path, body, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  assert.strictEqual(response.status, expectedStatus);
  assert.notStrictEqual(payload.code, 0);
  return payload;
}

async function run() {
  store.reset();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const login = await request(baseUrl, 'POST', '/auth/wechat-login', { code: 'demo-code' });
    assert.strictEqual(login.need_bind, true);

    await requestExpectFailure(baseUrl, 'POST', '/auth/bind', {
      bind_type: 'email',
      bind_value: 'analyst@neurogaze.local'
    }, 422);

    const bind = await request(baseUrl, 'POST', '/auth/bind', {
      bind_type: 'user_id',
      bind_value: '1858541407738915'
    });
    assert.ok(bind.token);
    assert.strictEqual(bind.user.bound, true);
    const token = bind.token;

    const me = await request(baseUrl, 'GET', '/user/me', null, token);
    assert.strictEqual(me.internal_account, '1858541407738915');

    const summary = await request(baseUrl, 'GET', '/dashboard/summary', null, token);
    assert.ok(summary.today_new_count >= 1);
    assert.ok(summary.high_priority_count >= 1);

    const list = await request(baseUrl, 'GET', '/articles?score=4&page=1&page_size=10', null, token);
    assert.ok(list.items.length >= 1);
    assert.ok(list.items[0].deadline);

    const first = list.items[0];
    const detail = await request(baseUrl, 'GET', `/articles/${first.id}`, null, token);
    assert.strictEqual(detail.id, first.id);
    assert.ok(detail.reminder_reason);

    const updated = await request(baseUrl, 'PATCH', `/articles/${first.id}/status`, {
      status: 'completed',
      comment: 'smoke test processed'
    }, token);
    assert.strictEqual(updated.status, 'completed');
    assert.strictEqual(updated.comment, 'smoke test processed');

    const messages = await request(baseUrl, 'GET', '/messages', null, token);
    assert.ok(Array.isArray(messages.items));

    const unread = messages.items.find((item) => !item.read);
    if (unread) {
      const read = await request(baseUrl, 'PATCH', `/messages/${unread.id}/read`, null, token);
      assert.strictEqual(read.read, true);
    }

    const subscribeConfig = await request(baseUrl, 'GET', '/subscribe/config', null, token);
    assert.deepStrictEqual(subscribeConfig.template_ids, ['test-template-id']);
    assert.ok(subscribeConfig.request_id);
    const subscription = await request(baseUrl, 'POST', '/subscribe', {
      request_id: subscribeConfig.request_id,
      raw: { 'test-template-id': 'accept' }
    }, token);
    assert.strictEqual(subscription.enabled, true);

    const todoSnapshots = await request(baseUrl, 'GET', '/todo-stat/snapshots?page=1&pageSize=5', null, token);
    assert.ok(Array.isArray(todoSnapshots.items));

    const rejectedFullImport = await fetch(baseUrl + '/todo-stat/import', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-import-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ batch_id: 'legacy-full-body', items: [] })
    });
    assert.strictEqual(rejectedFullImport.status, 422);

    const reminderStatus = await request(baseUrl, 'GET', '/reminders/status', null, token);
    assert.strictEqual(reminderStatus.schedule_enabled, true);

    const deniedReminder = await fetch(`${baseUrl}/reminders/run`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ batch_id: 'mock-batch' })
    });
    assert.strictEqual(deniedReminder.status, 401);

    const reminderRun = await request(baseUrl, 'POST', '/reminders/run', {
      batch_id: 'mock-batch'
    }, 'test-import-token');
    assert.strictEqual(reminderRun.skipped, false);
    assert.ok(reminderRun.fetched_count >= 1);

    const webhook = await fetch(`${baseUrl}/webhooks/feishu-record-created`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.strictEqual(webhook.status, 404);
    console.log('All API smoke tests passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
