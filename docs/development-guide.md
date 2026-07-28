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

## 推荐存储模式

默认推荐无 MySQL、无 COS 模式：

```env
STORAGE_MODE=remote-json
REMOTE_STATE_API_BASE_URL=https://你的Linux状态服务域名
REMOTE_STATE_TOKEN=强随机远程状态密钥
```

这会把当前状态保存到 Linux 服务器的 JSON 文件中，包括：

- 用户绑定关系
- 订阅状态和剩余可发送次数
- 最近一次导入的待办快照
- 最近导入记录
- 最近提醒发送记录

Linux 状态服务本地启动：

```bash
export REMOTE_STATE_TOKEN="强随机远程状态密钥"
export REMOTE_STATE_FILE="./tmp/yyt-state.json"
node scripts/remote-state-server.js
```

## 必需配置

云托管：

```env
TODO_IMPORT_TOKEN=强随机导入密钥
APP_TOKEN_SECRET=强随机业务Token密钥
WECHAT_APP_ID=wx964c3e4ac820ac37
WECHAT_APP_SECRET=微信公众平台获取的 AppSecret
WECHAT_SUBSCRIBE_TEMPLATE_ID=订阅消息模板ID
```

固定 IP 服务器：

```bash
export TODO_API_KEY="院院通API_KEY"
export CLOUD_API_BASE_URL="云托管HTTPS域名"
export TODO_IMPORT_TOKEN="与云托管一致"
export REMOTE_STATE_API_BASE_URL="Linux状态服务HTTPS域名"
export REMOTE_STATE_TOKEN="与云托管一致"
```

## 验证

- 绑定测试：只允许纯数字院院通用户 ID。
- 隔离测试：不同微信用户只能看到自己绑定 ID 的待办。
- 导入测试：`/api/todo-stat/import` 返回导入数量，Linux JSON 更新。
- 订阅测试：用户授权后 `/api/user/me` 返回订阅状态。
- 提醒测试：`/api/reminders/status` 返回最近导入和最近发送记录。
- 重启测试：容器重启后绑定和订阅仍从 Linux JSON 恢复。
