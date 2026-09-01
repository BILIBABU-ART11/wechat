const assert = require('assert');

const ENV_ID = 'prod-d5g6lfndn063b2d5d';
const SERVICE_NAME = 'express-0kx6';
const TOKEN = 'test-login-token';

async function testCloudContainerRequest() {
  let requestOptions = null;
  global.wx = {
    getStorageSync(key) {
      return key === 'yuanyuantong_token' ? TOKEN : '';
    },
    removeStorageSync() {},
    cloud: {
      callContainer(options) {
        requestOptions = options;
        options.success({
          statusCode: 200,
          data: { code: 0, data: { ok: true } }
        });
      }
    },
    request() {
      throw new Error('Cloud mode must not use wx.request');
    }
  };

  const request = require('../services/request');
  const result = await request.get('/api/test', { page: 1 }, { showError: false });

  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(requestOptions.config.env, ENV_ID);
  assert.strictEqual(requestOptions.path, '/api/test');
  assert.strictEqual(requestOptions.method, 'GET');
  assert.strictEqual(requestOptions.header['X-WX-SERVICE'], SERVICE_NAME);
  assert.strictEqual(requestOptions.header.Authorization, `Bearer ${TOKEN}`);
  assert.deepStrictEqual(requestOptions.data, { page: 1 });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(requestOptions, 'url'), false);
}

function testCloudInitialization() {
  let appDefinition = null;
  let initOptions = null;

  global.wx.cloud.init = (options) => {
    initOptions = options;
  };
  global.App = (definition) => {
    appDefinition = definition;
  };

  delete require.cache[require.resolve('../app')];
  require('../app');
  appDefinition.onLaunch.call(appDefinition);

  assert.ok(initOptions, 'wx.cloud.init should run during app launch');
  assert.strictEqual(initOptions.env, ENV_ID);
}

async function run() {
  await testCloudContainerRequest();
  testCloudInitialization();
  console.log('cloud container request tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
