# 腾讯云托管部署

选择 Express.js，容器端口保持 80。根目录的 Dockerfile、package.json 和 index.js 可直接用于构建。

## 环境变量

使用 [env-example.md](env-example.md) 中的腾讯云托管 JSON。必须配置：

- `APP_TOKEN_SECRET`
- `TODO_IMPORT_TOKEN`
- `REMOTE_STATE_API_BASE_URL`
- `REMOTE_STATE_TOKEN`
- `WECHAT_APP_ID=wx964c3e4ac820ac37`
- `WECHAT_APP_SECRET`
- `WECHAT_SUBSCRIBE_TEMPLATE_ID`
- `WECHAT_SUBSCRIBE_TEMPLATE_FIELDS`

保持：

```text
MOCK_MODE=false
TODO_DATA_SOURCE=import
STORAGE_MODE=remote-json
REMINDER_SCHEDULE_ENABLED=false
```

服务启动时缺少 `APP_TOKEN_SECRET` 会直接退出。其他关键配置缺失时，`/health` 返回 503 和缺失项，避免“部署成功但提醒不可用”。

## 部署顺序

1. 备份 Linux 的 `yyt-state.json`。
2. 先更新并重启 Linux 状态服务。
3. 确认状态服务 `/health` 返回 version 2。
4. 配置云托管环境变量。
5. 推送 GitHub，等待流水线部署。
6. 访问云托管 `/health`，确认 `ready=true`。
7. 手动运行一次 Linux 同步 service。
8. 真机登录、绑定、订阅并检查提醒。

## 小程序配置

仓库 AppID 已固定为 `wx964c3e4ac820ac37`。上传前执行：

```bash
npm run preflight
```

还需要在微信公众平台把云托管 HTTPS 地址加入 request 合法域名。Linux 状态服务域名不放入小程序合法域名，因为小程序不会直接访问它。

## 健康检查

```text
GET https://你的云托管域名/health
GET https://你的Linux状态服务域名/health
```

`POST /api/reminders/run` 和 `POST /api/todo-stat/import` 都使用 `TODO_IMPORT_TOKEN`，不能使用普通用户 Token。飞书 webhook 已删除。
