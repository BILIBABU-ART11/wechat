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

STORAGE_MODE=cos-json
COS_BUCKET=7072-prod-d5g6lfndn063b2d5d-1455148284
COS_REGION=ap-shanghai
COS_STATE_KEY=yyt/yyt-state.json

REMINDER_SCHEDULE_ENABLED=false
REMINDER_SCHEDULE_TIMES=09:20,17:20
REMINDER_TIME_ZONE=Asia/Shanghai

WECHAT_APP_ID=wx964c3e4ac820ac37
WECHAT_APP_SECRET=replace-with-wechat-app-secret
WECHAT_SUBSCRIBE_TEMPLATE_ID=replace-with-template-id
APP_TOKEN_SECRET=replace-with-a-strong-secret
```

If COS access fails because the runtime has no bucket credentials, add:

```bash
COS_SECRET_ID=replace-with-tencent-secret-id
COS_SECRET_KEY=replace-with-tencent-secret-key
```

## Fixed IP Server

```bash
export TODO_API_KEY="replace-with-yyt-api-key"
export CLOUD_API_BASE_URL="https://your-cloudbase-domain"
export TODO_IMPORT_TOKEN="same-as-cloudbase"
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
