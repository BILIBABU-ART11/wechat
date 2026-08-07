const assert = require('assert');

process.env.MOCK_MODE = 'false';
process.env.APP_TOKEN_SECRET = 'test-token-secret';
process.env.WECHAT_APP_ID = 'test-app-id';
process.env.WECHAT_APP_SECRET = 'test-app-secret';

const networkError = new TypeError('fetch failed');
networkError.cause = Object.assign(new Error('network unreachable'), { code: 'ENETUNREACH' });
global.fetch = async () => { throw networkError; };

const authService = require('../src/services/authService');

authService.wechatLogin('test-code')
  .then(() => assert.fail('Expected WeChat API network failure.'))
  .catch((error) => {
    assert.strictEqual(error.status, 502);
    assert.strictEqual(error.errorCode, 'WECHAT_API_UNREACHABLE');
    assert.deepStrictEqual(error.details, { network_code: 'ENETUNREACH' });
    console.log('WeChat API network error tests passed.');
  });
