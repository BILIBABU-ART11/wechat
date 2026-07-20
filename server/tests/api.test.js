const assert = require('assert');
process.env.MOCK_MODE = 'true';
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

    const subscription = await request(baseUrl, 'POST', '/subscribe', {
      accepted: true,
      mock: true,
      template_ids: []
    }, token);
    assert.strictEqual(subscription.enabled, true);

    const subscribeConfig = await request(baseUrl, 'GET', '/subscribe/config', null, token);
    assert.ok(Array.isArray(subscribeConfig.template_ids));

    const todoSnapshots = await request(baseUrl, 'GET', '/todo-stat/snapshots?page=1&pageSize=5', null, token);
    assert.ok(Array.isArray(todoSnapshots.items));

    const reminderStatus = await request(baseUrl, 'GET', '/reminders/status', null, token);
    assert.strictEqual(reminderStatus.schedule_enabled, true);

    const reminderRun = await request(baseUrl, 'POST', '/reminders/run', null, token);
    assert.strictEqual(reminderRun.skipped, false);
    assert.ok(reminderRun.fetched_count >= 1);

    const webhook = await request(baseUrl, 'POST', '/webhooks/feishu-record-created', {
      title: '测试招投标进度提醒',
      content: '新增记录触发站内提醒'
    });
    assert.strictEqual(webhook.received, true);
    console.log('All API smoke tests passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
