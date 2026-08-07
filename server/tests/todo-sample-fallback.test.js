const assert = require('assert');

process.env.MOCK_MODE = 'false';
process.env.TODO_DATA_SOURCE = 'import';
process.env.TODO_SAMPLE_FALLBACK_ENABLED = 'true';

const importedTodoStore = require('../src/services/importedTodoStore');
const config = require('../src/config');
const todoStatService = require('../src/services/todoStatService');

const emptyResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  source: 'remote-json-import',
  imported_at: ''
};

async function run() {
  const originalListSnapshots = importedTodoStore.listSnapshots;

  try {
    importedTodoStore.listSnapshots = async () => Object.assign({}, emptyResult);
    const sample = await todoStatService.listSnapshots({ userId: '2234567890' });
    assert.strictEqual(sample.total, 1);
    assert.strictEqual(sample.source, 'sample-fallback');
    assert.strictEqual(sample.items[0].userId, '2234567890');
    assert.ok(sample.items[0].content.includes('示例'));

    config.todoApi.sampleFallbackEnabled = false;
    const disabled = await todoStatService.listSnapshots({ userId: '2234567890' });
    assert.strictEqual(disabled.total, 0);
    config.todoApi.sampleFallbackEnabled = true;

    importedTodoStore.listSnapshots = async (query) => {
      if (query.userId) return Object.assign({}, emptyResult);
      return Object.assign({}, emptyResult, { total: 1 });
    };
    const noSampleForEmptyUser = await todoStatService.listSnapshots({ userId: '2234567890' });
    assert.strictEqual(noSampleForEmptyUser.total, 0);
    assert.strictEqual(noSampleForEmptyUser.source, 'remote-json-import');

    const realResult = Object.assign({}, emptyResult, {
      total: 1,
      items: [{
        id: 'real-todo-1',
        snapshotDate: '2026-08-07',
        userId: '2234567890',
        userName: '正式用户',
        pendingCount: 2,
        content: '正式待办数据'
      }]
    });
    importedTodoStore.listSnapshots = async () => realResult;
    const real = await todoStatService.listSnapshots({ userId: '2234567890' });
    assert.strictEqual(real, realResult);
  } finally {
    importedTodoStore.listSnapshots = originalListSnapshots;
  }

  console.log('Todo sample fallback tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
