# Environment Example

Backend environment variables should live in `server/.env`. Do not commit real values.

```bash
PORT=3000
NODE_ENV=development
MOCK_MODE=true
ALLOWED_ORIGINS=*

WECHAT_APP_ID=wx_xxx
WECHAT_APP_SECRET=replace_with_server_side_secret

FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=replace_with_server_side_secret
FEISHU_APP_TOKEN=base_xxx
FEISHU_TABLE_ID=tbl_xxx

SUBSCRIBE_TEMPLATE_IDS=template_id_1,template_id_2
APP_TOKEN_SECRET=replace-with-a-strong-secret
```

Frontend placeholders live in `utils/constants.js`:

```js
REQUEST_MODE: 'backend'
MOCK_ENABLED: false
ENABLE_MOCK_FALLBACK: true
API_BASE_URL: 'http://127.0.0.1:3000'
```

Only public routing/config values belong in the frontend. Secrets belong in backend environment variables.
