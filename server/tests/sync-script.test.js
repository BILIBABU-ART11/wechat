const assert = require('assert');
const {
  fetchAllTodoSnapshots,
  createBatchId,
  readConfig,
  validateSyncConfig
} = require('../../scripts/sync-todo-to-cloud');

const logger = {
  info() {},
  warn() {},
  error() {}
};

function config(overrides) {
  return Object.assign({
    todoBaseUrl: 'https://todo.example/app',
    todoApiKey: 'test-key',
    pageSize: 1,
    snapshotDate: '',
    maxPages: 10,
    todoTimeoutMs: 2000,
    requestRetries: 0
  }, overrides || {});
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

async function run() {
  const originalFetch = global.fetch;
  const originalCloudTrigger = process.env.CLOUD_TRIGGER_ENABLED;
  try {
    process.env.CLOUD_TRIGGER_ENABLED = 'false';
    const localOnly = readConfig(process.cwd());
    assert.strictEqual(localOnly.cloudTriggerEnabled, false);
    assert.doesNotThrow(() => validateSyncConfig(Object.assign({}, localOnly, {
      todoApiKey: 'test-key',
      remoteStateBaseUrl: 'http://127.0.0.1:3100',
      remoteStateToken: 'test-state-token',
      cloudBaseUrl: '',
      importToken: ''
    })));
    assert.throws(() => validateSyncConfig(Object.assign({}, localOnly, {
      cloudTriggerEnabled: true,
      todoApiKey: 'test-key',
      remoteStateBaseUrl: 'http://127.0.0.1:3100',
      remoteStateToken: 'test-state-token',
      cloudBaseUrl: '',
      importToken: ''
    })), /cloud-base-url/);

    let call = 0;
    global.fetch = async () => {
      call += 1;
      if (call === 1) return response({ items: [{ id: '1' }], total: 3, page: 1, pageSize: 1 });
      return response({ items: [], total: 3, page: 2, pageSize: 1 });
    };
    const earlyEmpty = await fetchAllTodoSnapshots(config(), logger);
    assert.strictEqual(earlyEmpty.items.length, 1);
    assert.strictEqual(call, 2);

    call = 0;
    global.fetch = async () => {
      call += 1;
      return response({ items: [{ id: 'same' }], total: 3, page: call, pageSize: 1 });
    };
    await assert.rejects(
      () => fetchAllTodoSnapshots(config(), logger),
      /made no progress/
    );

    call = 0;
    global.fetch = async () => {
      call += 1;
      return response({ items: [{ id: String(call) }], total: 5, page: call, pageSize: 1 });
    };
    await assert.rejects(
      () => fetchAllTodoSnapshots(config({ maxPages: 2 }), logger),
      /exceeded TODO_SYNC_MAX_PAGES/
    );

    const items = [{ id: 'b', value: 2 }, { id: 'a', value: 1 }];
    assert.strictEqual(
      createBatchId(items, '2026-08-04T09:20:00.000Z'),
      createBatchId(items.slice().reverse(), '2026-08-04T09:20:00.000Z')
    );
  } finally {
    global.fetch = originalFetch;
    if (originalCloudTrigger === undefined) delete process.env.CLOUD_TRIGGER_ENABLED;
    else process.env.CLOUD_TRIGGER_ENABLED = originalCloudTrigger;
  }
  console.log('Todo sync boundary tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
