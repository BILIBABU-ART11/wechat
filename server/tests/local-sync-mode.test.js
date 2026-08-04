const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createApp } = require('../../scripts/remote-state-server');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yyt-local-sync-'));
  const stateFile = path.join(tempDir, 'state.json');
  const logDir = path.join(tempDir, 'logs');
  const stateToken = 'local-sync-state-token';

  const todoServer = http.createServer((req, res) => {
    assert.strictEqual(req.headers.authorization, 'Bearer local-sync-api-key');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      items: [{
        id: 'local-sync-item-1',
        snapshotDate: '2026-08-04',
        userId: '9000001',
        userName: 'Local Test',
        pendingCount: 2,
        content: 'two pending items'
      }],
      total: 1,
      page: 1,
      pageSize: 100
    }));
  });
  const stateServer = createApp({ token: stateToken, stateFile }).listen(0, '127.0.0.1');

  await Promise.all([
    listen(todoServer),
    new Promise((resolve) => stateServer.once('listening', resolve))
  ]);

  try {
    const projectRoot = path.resolve(__dirname, '..', '..');
    const result = await runProcess(process.execPath, [path.join(projectRoot, 'scripts', 'sync-todo-to-cloud.js')], {
      cwd: projectRoot,
      env: Object.assign({}, process.env, {
        TODO_API_BASE_URL: `http://127.0.0.1:${todoServer.address().port}`,
        TODO_API_KEY: 'local-sync-api-key',
        REMOTE_STATE_API_BASE_URL: `http://127.0.0.1:${stateServer.address().port}`,
        REMOTE_STATE_TOKEN: stateToken,
        TODO_SYNC_LOG_DIR: logDir,
        TODO_SYNC_REQUEST_RETRIES: '0',
        CLOUD_TRIGGER_ENABLED: 'false',
        CLOUD_API_BASE_URL: '',
        TODO_IMPORT_TOKEN: '',
        TRIGGER_REMINDERS: 'false'
      }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    assert.strictEqual(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Cloud import trigger skipped/);
    assert.match(result.stdout, /Todo sync job completed/);

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(state.todo_snapshots.items.length, 1);
    assert.strictEqual(state.todo_snapshots.items[0].id, 'local-sync-item-1');
    assert.ok(state.todo_snapshots.batch_id);
    assert.strictEqual(fs.existsSync(path.join(logDir, 'todo-sync-latest.json')), true);
    console.log('Local-only sync integration test passed.');
  } finally {
    await Promise.all([close(todoServer), close(stateServer)]);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
