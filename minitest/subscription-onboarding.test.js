const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function installStub(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports
  };
}

async function run() {
  const appConfig = JSON.parse(read('app.json'));
  assert.ok(appConfig.pages.includes('pages/subscribe/subscribe'));

  const bindSource = read('pages/bind/bind.js');
  assert.match(bindSource, /redirectTo\(\{ url: '\/pages\/subscribe\/subscribe' \}\)/);
  assert.doesNotMatch(bindSource, /switchTab\(\{ url: '\/pages\/index\/index' \}\)/);

  const profileSource = read('pages/profile/profile.js');
  assert.match(profileSource, /navigateTo\(\{ url: '\/pages\/subscribe\/subscribe' \}\)/);
  assert.doesNotMatch(profileSource, /requestReminderSubscribe/);

  const apiPath = require.resolve('../services/api');
  const permissionPath = require.resolve('../utils/permission');
  const storagePath = require.resolve('../utils/storage');
  const authGuardPath = require.resolve('../utils/authGuard');
  const pagePath = require.resolve('../pages/subscribe/subscribe');
  const calls = [];
  let configSequence = 0;
  let remainingCount = 0;
  let pageDefinition;
  let switchedTo = '';

  installStub(apiPath, {
    getCurrentUser() {
      calls.push('getCurrentUser');
      return Promise.resolve({ subscription: { enabled: remainingCount > 0, remaining_count: remainingCount } });
    },
    getSubscribeConfig() {
      configSequence += 1;
      calls.push(`getSubscribeConfig:${configSequence}`);
      return Promise.resolve({ template_ids: ['template-1'], request_id: `request-${configSequence}` });
    },
    subscribeReminder(payload) {
      calls.push(`subscribeReminder:${payload.request_id}`);
      remainingCount += 1;
      return Promise.resolve({ enabled: true, remaining_count: remainingCount });
    }
  });
  installStub(permissionPath, {
    requestReminderSubscribe(config) {
      calls.push(`requestSubscribeMessage:${config.request_id}`);
      return Promise.resolve({ request_id: config.request_id, raw: { 'template-1': 'accept' } });
    }
  });
  installStub(storagePath, {
    getSubscribeState() {
      return { enabled: false, remaining_count: 0 };
    },
    setSubscribeState(state) {
      calls.push(`setSubscribeState:${state.remaining_count}`);
    },
    setUser() {}
  });
  installStub(authGuardPath, { requireLogin: () => true });

  global.getApp = () => ({ globalData: {} });
  global.wx = {
    showToast() {},
    switchTab({ url }) {
      switchedTo = url;
    }
  };
  global.Page = (definition) => {
    pageDefinition = definition;
  };

  delete require.cache[pagePath];
  const helpers = require(pagePath);
  assert.strictEqual(helpers.TARGET_GRANTS, 10);
  assert.deepStrictEqual(helpers.progressFor({ remaining_count: 4 }), {
    remainingCount: 4,
    progressPercent: 40,
    completed: false
  });
  assert.deepStrictEqual(helpers.progressFor({ remaining_count: 14 }), {
    remainingCount: 14,
    progressPercent: 100,
    completed: true
  });

  const page = Object.assign({}, pageDefinition, {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update) {
      Object.assign(this.data, update);
    }
  });

  await pageDefinition.onShow.call(page);
  assert.strictEqual(page.data.ready, true);
  calls.length = 0;
  await pageDefinition.grantOne.call(page);
  assert.deepStrictEqual(calls.slice(0, 3), [
    'requestSubscribeMessage:request-1',
    'subscribeReminder:request-1',
    'setSubscribeState:1'
  ]);
  assert.strictEqual(calls.filter((item) => item.startsWith('requestSubscribeMessage')).length, 1);
  assert.strictEqual(page.data.remainingCount, 1);
  assert.strictEqual(page.data.progressPercent, 10);
  assert.strictEqual(page.data.loading, false);
  assert.strictEqual(page.data.ready, true);

  calls.length = 0;
  page.data.loading = true;
  await pageDefinition.grantOne.call(page);
  assert.strictEqual(calls.length, 0);
  page.data.loading = false;
  page.data.remainingCount = 10;
  page.data.completed = true;
  await pageDefinition.grantOne.call(page);
  assert.strictEqual(calls.length, 0);

  pageDefinition.skip.call(page);
  assert.strictEqual(switchedTo, '/pages/index/index');
  console.log('subscription onboarding tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});