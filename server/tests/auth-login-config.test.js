const assert = require('assert');

process.env.MOCK_MODE = 'false';
process.env.APP_TOKEN_SECRET = 'test-token-secret';
process.env.TODO_IMPORT_TOKEN = 'test-import-token';
process.env.WECHAT_APP_ID = '';
process.env.WECHAT_APP_SECRET = '';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID = 'test-template-id';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_FIELDS = '{"title":"thing1","count":"number2","content":"thing3","date":"date4"}';
process.env.REMINDER_SCHEDULE_ENABLED = 'false';

const app = require('../src/app');

async function requestJson(baseUrl, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { response, payload };
}

async function run() {
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await requestJson(baseUrl, 'POST', '/api/auth/wechat-login', { code: 'demo-code' });
    assert.strictEqual(login.response.status, 503);
    assert.strictEqual(login.payload.code, 503);
    assert.strictEqual(login.payload.error_code, 'LOGIN_CONFIG_MISSING');
    assert.ok(login.payload.message.includes('微信登录配置'));
    assert.deepStrictEqual(login.payload.data.missing, ['WECHAT_APP_ID', 'WECHAT_APP_SECRET']);

    const health = await requestJson(baseUrl, 'GET', '/health');
    assert.strictEqual(health.response.status, 503);
    assert.strictEqual(health.payload.data.login_ready, false);
    assert.deepStrictEqual(health.payload.data.login_reasons, ['WECHAT_APP_ID', 'WECHAT_APP_SECRET']);

    console.log('Auth login config tests passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
