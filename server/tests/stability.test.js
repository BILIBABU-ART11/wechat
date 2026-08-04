const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../../scripts/remote-state-server');

const token = 'stability-remote-token';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyt-stability-'));
const stateFile = path.join(tempDir, 'state.json');

function authHeaders() {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  };
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(baseUrl, method, route, body, authenticated = true) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: authenticated ? authHeaders() : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { response, payload };
}

async function run() {
  const projectConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'project.config.json'), 'utf8'));
  assert.strictEqual(projectConfig.appid, 'wx964c3e4ac820ac37');

  fs.writeFileSync(stateFile, JSON.stringify({
    version: 1,
    users: [],
    subscriptions: {},
    todo_snapshots: { items: [], imported_at: '' },
    import_runs: [],
    reminder_send_logs: []
  }));

  const server = await listen(createApp({ token, stateFile }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await request(baseUrl, 'GET', '/health', undefined, false);
    assert.strictEqual(health.response.status, 200);
    assert.strictEqual(health.payload.data.version, 2);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(health.payload.data, 'state_file'), false);

    const bindings = await Promise.all(Array.from({ length: 12 }, (_, index) => request(baseUrl, 'POST', '/users/bind', {
      openid: `openid-${index}`,
      internal_account: `900000${index}`
    })));
    bindings.forEach(({ response }) => assert.strictEqual(response.status, 200));

    const persistedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(persistedState.users.length, 12);
    assert.ok(persistedState.revision >= 12);

    const legacyGet = await request(baseUrl, 'GET', '/state');
    const legacyPut = await request(baseUrl, 'PUT', '/state', { users: [] });
    assert.strictEqual(legacyGet.response.status, 405);
    assert.strictEqual(legacyPut.response.status, 405);

    const snapshots = await request(baseUrl, 'POST', '/todo/snapshots', {
      batch_id: 'batch-stability',
      imported_at: '2026-08-04T09:20:00+08:00',
      data: {
        items: [{
          id: 'snapshot-1',
          snapshotDate: '2026-08-04',
          userId: '9000000',
          userName: 'Test User',
          pendingCount: 1,
          content: 'one pending item'
        }]
      }
    });
    assert.strictEqual(snapshots.payload.data.batch_id, 'batch-stability');

    const firstClaim = await request(baseUrl, 'POST', '/imports/batch-stability/claim', { source: 'test' });
    const duplicateClaim = await request(baseUrl, 'POST', '/imports/batch-stability/claim', { source: 'test' });
    assert.strictEqual(firstClaim.payload.data.claimed, true);
    assert.strictEqual(duplicateClaim.payload.data.claimed, false);
    const batchStatus = await request(baseUrl, 'GET', '/imports/batch-stability');
    assert.strictEqual(batchStatus.payload.data.status, 'processing');

    const stat = fs.statSync(stateFile);
    if (process.platform !== 'win32') assert.strictEqual(stat.mode & 0o777, 0o600);
    assert.strictEqual(fs.existsSync(`${stateFile}.bak`), true);

    fs.writeFileSync(stateFile, '{broken json', 'utf8');
    const recovered = await request(baseUrl, 'GET', '/users/u_9000000');
    assert.strictEqual(recovered.response.status, 200);
    assert.strictEqual(recovered.payload.data.internal_account, '9000000');

    fs.writeFileSync(stateFile + '.bak', '{also broken', 'utf8');
    const unrecoverable = await request(baseUrl, 'GET', '/health', undefined, false);
    assert.strictEqual(unrecoverable.response.status, 500);
    assert.strictEqual(unrecoverable.payload.data.healthy, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('Stability and security tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
