# NeuroGaze_MiniProgram

NeuroGaze_MiniProgram 是一个原生微信小程序 + Express 后端骨架，用于企业内部招投标项目进度提醒。当前 MVP 默认由小程序调用本地后端 mock API，用户只查看项目阶段、截止时间和提醒原因，不在小程序内处理或回写复杂业务信息。

## 用微信开发者工具导入

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择本目录：`NeuroGaze_MiniProgram`。
4. AppID 当前为占位值 `touristappid`，后续替换为真实小程序 AppID。
5. 先启动后端，再从 `pages/login/login` 开始体验 mock 登录和绑定流程。

## 启动后端

```bash
cd server
npm install
npm run dev
```

后端需要 Node.js 18 或更高版本，默认监听 `http://localhost:3000`，健康检查为：

```bash
curl http://localhost:3000/health
```

## 腾讯云托管上线

后端云托管部署配置已放在：

```text
Dockerfile
container.config.json
```

详细步骤见：

```text
docs/tencent-cloudbase-deploy.md
```

正式发布前，把 `utils/constants.js` 中 `API_BASE_URLS.cloud` 的值改成云托管 HTTPS 域名，并将 `API_ENV` 改为 `cloud`。

## 后端优先 / Mock / 真实 API 切换

小程序端默认在 `utils/constants.js` 中使用：

```js
REQUEST_MODE: 'backend'
MOCK_ENABLED: false
ENABLE_MOCK_FALLBACK: false
API_BASE_URL: 'http://127.0.0.1:3000'
```

含义：

- `REQUEST_MODE: 'backend'`：优先通过 `wx.request` 调用后端。
- `MOCK_ENABLED: false`：不再默认直接读取前端 mock 数据。
- `ENABLE_MOCK_FALLBACK: false`：接口失败时不再显示前端虚拟数据，避免把 mock 当成真实待办。
- `API_BASE_URL`：本地微信开发者工具调试时使用 `http://127.0.0.1:3000`。

后续接入真实后端时：

1. 将 `API_BASE_URL` 改为你的后端 HTTPS 域名。
2. 保持 `ENABLE_MOCK_FALLBACK=false`，避免真实接口异常时回退虚拟数据。
3. 在微信公众平台配置 request 合法域名。
4. 后端在 `server/.env` 中配置微信、飞书和订阅消息相关变量。

手机预览时，`127.0.0.1` 指向手机本机，不是电脑。请改为局域网 IP 或已部署的 HTTPS 后端地址。

## 院院通待办 API 对接

后端已按《查询待办API文档》接入 `GET /openapi/todo-stat/snapshots`。真实联调时：

1. 复制 `server/.env.example` 为 `server/.env`。
2. 设置 `MOCK_MODE=false`。
3. 设置 `TODO_API_BASE_URL=https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73`。
4. 设置 `TODO_API_KEY` 为院院通提供的 API Key。
5. 确认后端服务器出口 IP 已加入院院通 IP 白名单。

后端会使用 `Authorization: Bearer <TODO_API_KEY>` 请求外部接口，并把待办快照映射到小程序现有首页、待办列表、详情和提醒中心。

当前默认使用 `TODO_DATA_SOURCE=api`，后端会直接请求院院通外部 API。本地快照文件仅作为测试模式保留；需要临时使用文件测试时，手动改成：

```env
TODO_DATA_SOURCE=file
```

文件测试模式读取：

```text
real-data/todo-snapshots-latest.json
```

也就是 `scripts/fetch-real-todo-data.ps1` 拉取下来的真实快照文件。用户绑定后，只能看到与其用户ID授权码一致的快照记录。

## 定时提醒

后端服务启动后会按 `REMINDER_SCHEDULE_TIMES=09:00,17:00` 每天执行两次。调度时区由 `REMINDER_TIME_ZONE=Asia/Shanghai` 强制指定，也就是按北京时间执行：

1. 在 `TODO_DATA_SOURCE=api` 时调用院院通 `GET /openapi/todo-stat/snapshots` 拉取全部待办快照。
2. 过滤 `pendingCount > 0` 的记录。
3. 写入小程序提醒中心。
4. 对已订阅用户尝试发送微信订阅消息。

可通过 `POST /api/reminders/run` 手动触发一次，通过 `GET /api/reminders/status` 查看最近执行状态。

真实微信订阅消息发送需要同时配置：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_SUBSCRIBE_TEMPLATE_ID`

用户还需要在“我的 -> 订阅提醒”中完成微信订阅授权。

## 登录流程

1. 小程序调用 `wx.login` 获取临时 `code`。
2. 小程序调用后端 `POST /api/auth/wechat-login`。
3. 后端用 `code2Session` 换取 `openid`，并检查是否绑定内部用户。
4. 已绑定时返回业务 `token`、用户信息、角色权限。
5. 未绑定时返回 `need_bind=true`，小程序跳转绑定页。
6. 用户输入院院通用户ID授权码，调用 `POST /api/auth/bind`。
7. 后端只接受 `bind_type=user_id` 且为纯数字用户ID授权码，校验后绑定 `openid` 与内部用户，并返回业务 `token`。
8. 后续接口通过业务 `token` 鉴权。

`session_key` 绝不能返回给小程序前端。

## 飞书互通

小程序不直接请求飞书 OpenAPI，只调用自己的后端。后端负责：

- 获取并缓存 `tenant_access_token`。
- 读取飞书多维表格中的招投标项目记录。
- 同步项目阶段、截止时间、提醒原因和已读状态。
- 统一处理飞书错误、限流和字段映射。

后端占位服务在 `server/src/services/feishuService.js`。

## 消息提醒

- 小程序内提醒中心展示截止提醒、阶段变化和新项目提醒。
- 微信订阅消息只用于截止临近、阶段变化等需要及时知晓的提醒。
- 小程序端只发起 `wx.requestSubscribeMessage` 授权。
- 后端保存订阅状态，并在飞书项目新增或阶段变化时发送订阅消息。
- 订阅模板 ID 放在后端环境变量 `SUBSCRIBE_TEMPLATE_IDS`，不要写死在前端。

## 安全提醒

不要在前端保存真实密钥。以下信息只能放在后端环境变量或密钥管理系统中：

- 微信小程序 `AppSecret`
- 飞书 `AppSecret`
- 飞书多维表格访问凭证
- 订阅消息发送凭证
- 任何第三方 API Key

## 后续 TODO

- 接入真实微信 `code2Session`。
- 接入内部用户白名单和角色权限。
- 接入飞书招投标项目字段映射和分页同步。
- 实现后端 token/JWT 签发、刷新和失效机制。
- 接入微信订阅消息发送。
- 增加服务端日志、限流、告警和审计记录。
