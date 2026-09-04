const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../../scripts/remote-state-server');

const token = 'subscription-grants-state-token';
const stateFile = path.join(os.tmpdir(), `yyt-subscription-grants-${Date.now()}.json`);

process.env.MOCK_MODE = 'false';
process.env.STORAGE_MODE = 'remote-json';
process.env.REMOTE_STATE_TOKEN = token;
delete process.env.MYSQL_ADDRESS;
delete process.env.MYSQL_USERNAME;
delete process.env.MYSQL_PASSWORD;

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const remoteServer = await listen(createApp({ token, stateFile }));
  process.env.REMOTE_STATE_API_BASE_URL = `http://127.0.0.1:${remoteServer.address().port}`;
  const accountStore = require('../src/services/accountStore');

  try {
    const user = await accountStore.bindUser('openid-ten-grants', '8234567890');
    let subscription;
    for (let index = 1; index <= 10; index += 1) {
      subscription = await accountStore.saveSubscription(user.id, {
        request_id: `grant-request-${index}`,
        accepted: true,
        accepted_template_ids: ['template-ten-grants'],
        template_ids: ['template-ten-grants'],
        raw: { 'template-ten-grants': 'accept' }
      });
    }

    assert.strictEqual(subscription.remaining_count, 10);
    assert.strictEqual(subscription.grants['template-ten-grants'], 10);
    assert.strictEqual(subscription.enabled, true);
    await assert.rejects(
      () => accountStore.saveSubscription(user.id, {
        request_id: 'grant-request-10',
        accepted: true,
        accepted_template_ids: ['template-ten-grants'],
        template_ids: ['template-ten-grants']
      }),
      (error) => error.status === 409
    );

    const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(persisted.subscriptions[user.id].remaining_count, 10);
    assert.strictEqual(persisted.subscriptions[user.id].grants['template-ten-grants'], 10);
    console.log('subscription grant accumulation tests passed');
  } finally {
    await new Promise((resolve) => remoteServer.close(resolve));
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
    if (fs.existsSync(`${stateFile}.bak`)) fs.unlinkSync(`${stateFile}.bak`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});