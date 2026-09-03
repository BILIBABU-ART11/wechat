const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function run() {
  const requiredFiles = [
    'deploy/aliyun-test/install.sh',
    'deploy/aliyun-test/update.sh',
    'deploy/aliyun-test/diagnose.sh',
    'deploy/aliyun-test/enable-cloud-http.sh',
    'deploy/aliyun-test/uninstall.sh',
    'deploy/aliyun-test/runtime-package.json',
    'deploy/aliyun-test/runtime-package-lock.json',
    'deploy/aliyun-test/systemd/yyt-remote-state.service',
    'deploy/aliyun-test/systemd/yyt-todo-sync.service',
    'deploy/aliyun-test/systemd/yyt-todo-sync-morning.timer',
    'deploy/aliyun-test/systemd/yyt-todo-sync-evening.timer',
    'scripts/build-aliyun-deploy-package.ps1'
  ];
  requiredFiles.forEach((file) => assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`));

  const installer = read('deploy/aliyun-test/install.sh');
  assert.match(installer, /EXPECTED_PUBLIC_IP=.*120\.26\.231\.85/);
  assert.match(installer, /CLOUD_TRIGGER_ENABLED=false/);
  assert.match(installer, /TRIGGER_REMINDERS=false/);
  assert.match(installer, /REMOTE_STATE_HOST=127\.0\.0\.1/);
  assert.doesNotMatch(installer, /REMOTE_STATE_HOST=0\.0\.0\.0/);

  const cloudActivator = read('deploy/aliyun-test/enable-cloud-http.sh');
  assert.match(cloudActivator, /REMOTE_STATE_HOST.*0\.0\.0\.0/);
  assert.match(cloudActivator, /REMOTE_STATE_PORT.*3100/);
  assert.match(cloudActivator, /CLOUD_TRIGGER_ENABLED.*true/);
  assert.match(cloudActivator, /TRIGGER_REMINDERS.*true/);
  assert.match(cloudActivator, /yyt-cloudrun-env\.json/);
  assert.match(cloudActivator, /chmod 0600/);
  assert.doesNotMatch(cloudActivator, /REMOTE_STATE_TOKEN=[a-zA-Z0-9_-]{20,}/);

  const stateUnit = read('deploy/aliyun-test/systemd/yyt-remote-state.service');
  assert.match(stateUnit, /NoNewPrivileges=true/);
  assert.match(stateUnit, /ProtectSystem=strict/);
  assert.match(stateUnit, /ReadWritePaths=@STATE_DIR@/);

  const morning = read('deploy/aliyun-test/systemd/yyt-todo-sync-morning.timer');
  const evening = read('deploy/aliyun-test/systemd/yyt-todo-sync-evening.timer');
  assert.match(morning, /OnCalendar=@ON_CALENDAR@/);
  assert.match(evening, /OnCalendar=@ON_CALENDAR@/);

  requiredFiles.filter((file) => file.endsWith('.sh')).forEach((file) => {
    assert.strictEqual(read(file).includes('\r\n'), false, `${file} must use LF line endings`);
  });
  console.log('Aliyun deployment package tests passed.');
}

run();
