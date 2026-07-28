# Environment Example

Backend environment variables should live in `server/.env` locally, or in Tencent CloudBase environment variables in production. Do not commit real secret values.

## CloudBase Production

```bash
PORT=80
NODE_ENV=production
MOCK_MODE=false
ALLOWED_ORIGINS=*
ENABLE_EGRESS_IP_CHECK=false

TODO_DATA_SOURCE=import
TODO_IMPORT_TOKEN=replace-with-import-token

STORAGE_MODE=remote-json
REMOTE_STATE_API_BASE_URL=https://your-linux-state-domain
REMOTE_STATE_TOKEN=replace-with-remote-state-token
REMOTE_STATE_TIMEOUT_MS=10000

REMINDER_SCHEDULE_ENABLED=false
REMINDER_SCHEDULE_TIMES=09:20,17:20
REMINDER_TIME_ZONE=Asia/Shanghai

WECHAT_APP_ID=wx964c3e4ac820ac37
WECHAT_APP_SECRET=replace-with-wechat-app-secret
WECHAT_SUBSCRIBE_TEMPLATE_ID=replace-with-template-id
APP_TOKEN_SECRET=replace-with-a-strong-secret
```

Linux remote state server:

```bash
export REMOTE_STATE_TOKEN="same-as-cloudbase"
export REMOTE_STATE_FILE="/opt/yyt-state/yyt-state.json"
export REMOTE_STATE_PORT=3100
node scripts/remote-state-server.js
```

## Fixed IP Server

```bash
export TODO_API_KEY="replace-with-yyt-api-key"
export CLOUD_API_BASE_URL="https://your-cloudbase-domain"
export TODO_IMPORT_TOKEN="same-as-cloudbase"
export REMOTE_STATE_API_BASE_URL="https://your-linux-state-domain"
export REMOTE_STATE_TOKEN="same-as-cloudbase-remote-state-token"
export TODO_SYNC_LOG_DIR="/var/log/yyt-todo-sync"
```

## Frontend

Frontend placeholders live in `utils/constants.js`:

```js
REQUEST_MODE: 'backend'
MOCK_ENABLED: false
ENABLE_MOCK_FALLBACK: true
API_BASE_URLS.cloud: 'https://your-cloudbase-domain'
```

Only public routing/config values belong in the frontend. Secrets belong in backend environment variables.
