const assert = require('assert');

process.env.MOCK_MODE = 'false';
process.env.APP_TOKEN_SECRET = 'test-token-secret';
process.env.WECHAT_APP_ID = 'test-app-id';
process.env.WECHAT_APP_SECRET = 'test-app-secret';
process.env.WECHAT_API_BASE_URL = 'http://api.weixin.qq.com';

let requestedUrl = '';
global.fetch = async (url) => {
  requestedUrl = String(url);
  return {
    ok: true,
    json: async () => ({ errcode: 40029, errmsg: 'invalid code' })
  };
};

const authService = require('../src/services/authService');

authService.wechatLogin('test-code')
  .then(() => assert.fail('Expected invalid diagnostic code.'))
  .catch((error) => {
    assert.strictEqual(error.status, 502);
    assert.strictEqual(error.errorCode, 'WECHAT_CODE2SESSION_FAILED');
    assert.ok(requestedUrl.startsWith('http://api.weixin.qq.com/sns/jscode2session?'));
    console.log('WeChat API base URL tests passed.');
  });
