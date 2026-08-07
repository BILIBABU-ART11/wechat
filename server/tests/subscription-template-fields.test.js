const assert = require('assert');

process.env.MOCK_MODE = 'false';
process.env.APP_TOKEN_SECRET = 'test-token-secret';
process.env.WECHAT_APP_ID = 'test-app-id';
process.env.WECHAT_APP_SECRET = 'test-app-secret';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID = 'test-template-id';
process.env.WECHAT_SUBSCRIBE_TEMPLATE_FIELDS = '{"time":"time11","content":"thing1"}';

const config = require('../src/config');
const subscriptionService = require('../src/services/subscriptionService');

assert.strictEqual(config.wechat.templateFieldsValid, true);
assert.deepStrictEqual(subscriptionService.buildMessageData({
  reminderTime: '2026-08-07 09:20',
  content: '张三当前还有2条待办'
}), {
  time11: { value: '2026-08-07 09:20' },
  thing1: { value: '张三当前还有2条待办' }
});

console.log('Subscription template field tests passed.');
