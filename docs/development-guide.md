# 开发指南

## 本地运行

```bash
cd server
npm install
npm test
```

小程序端使用微信开发者工具导入项目根目录。

## 正式服务模式

正式环境使用固定 IP 服务器导入模式：

```env
MOCK_MODE=false
TODO_DATA_SOURCE=import
REMINDER_SCHEDULE_ENABLED=false
REMINDER_SCHEDULE_TIMES=09:20,17:20
REMINDER_TIME_ZONE=Asia/Shanghai
```

说明：

- 云托管不直接请求院院通 API。
- 固定 IP 服务器运行 `scripts/sync-todo-to-cloud.js`。
- 同步脚本请求院院通 API 后 POST 到 `/api/todo-stat/import`。
- 导入成功后由后端触发微信订阅消息发送。

## 必需配置

云托管：

```env
TODO_IMPORT_TOKEN=强随机导入密钥
APP_TOKEN_SECRET=强随机业务Token密钥
WECHAT_APP_ID=wx964c3e4ac820ac37
WECHAT_APP_SECRET=微信公众平台获取的AppSecret
WECHAT_SUBSCRIBE_TEMPLATE_ID=订阅消息模板ID
```

MySQL 可选。不配置 MySQL 时使用内存模式，适合只展示最近一次导入数据的轻量上线方式。

固定 IP 服务器：

```bash
export TODO_API_KEY="院院通API_KEY"
export CLOUD_API_BASE_URL="云托管HTTPS域名"
export TODO_IMPORT_TOKEN="与云托管一致"
```

## 验证

- 绑定测试：只允许纯数字院院通用户 ID。
- 隔离测试：不同微信用户只能看到自己绑定 ID 的待办。
- 导入测试：`/api/todo-stat/import` 返回导入数量。
- 订阅测试：用户授权后 `/api/user/me` 返回订阅状态。
- 提醒测试：`/api/reminders/status` 返回最近导入和最近发送记录。
