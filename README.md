# 院院通小程序

院院通待办提醒小程序，包含微信小程序前端、腾讯云托管 Express.js 后端，以及固定 IP 服务器定时同步脚本。

## 当前正式架构

```text
固定 IP 服务器
  -> 每天 09:20 / 17:20 请求院院通 API
  -> POST 到腾讯云托管 /api/todo-stat/import

腾讯云托管 Express 后端
  -> 通过 remote-json 读写 Linux 状态服务
  -> 小程序按绑定用户 ID 读取自己的待办
  -> 导入成功后触发微信订阅消息

固定 IP Linux 状态服务
  -> 保存 /opt/yyt-state/yyt-state.json
```

## 关键目录

```text
server/                       Express.js 后端
scripts/sync-todo-to-cloud.js 固定 IP 服务器同步脚本
scripts/remote-state-server.js Linux JSON 状态服务
scripts/register-todo-sync-cron.sh Linux cron 注册脚本
pages/                        小程序页面
services/                     小程序请求与认证服务
utils/                        小程序工具与常量
docs/                         部署和同步说明
```

## 后端接口

```text
POST /api/auth/wechat-login
POST /api/auth/bind
GET  /api/user/me
GET  /api/todo-stat/snapshots
POST /api/todo-stat/import
GET  /api/reminders/status
POST /api/subscribe
GET  /health
```

## 云托管环境变量

正式环境推荐使用 Linux `remote-json`，不需要 MySQL，也不需要 COS：

```json
{
  "PORT": "80",
  "NODE_ENV": "production",
  "MOCK_MODE": "false",
  "TODO_DATA_SOURCE": "import",
  "STORAGE_MODE": "remote-json",
  "REMOTE_STATE_API_BASE_URL": "https://你的Linux状态服务域名",
  "REMOTE_STATE_TOKEN": "强随机远程状态密钥",
  "TODO_IMPORT_TOKEN": "强随机导入密钥",
  "APP_TOKEN_SECRET": "强随机业务Token密钥",
  "REMINDER_SCHEDULE_ENABLED": "false",
  "WECHAT_APP_ID": "wx964c3e4ac820ac37",
  "WECHAT_APP_SECRET": "微信后台获取的 AppSecret",
  "WECHAT_SUBSCRIBE_TEMPLATE_ID": "订阅消息模板ID"
}
```

Linux 状态服务需要配置：

```bash
export REMOTE_STATE_TOKEN="与云托管 REMOTE_STATE_TOKEN 一致"
export REMOTE_STATE_FILE="/opt/yyt-state/yyt-state.json"
export REMOTE_STATE_PORT=3100
node scripts/remote-state-server.js
```

存储优先级为：`mysql > remote-json > cos-json > memory`。不配置 MySQL 时会优先使用远程 JSON；没有远程 JSON 时仍可使用 COS JSON；都没有配置时才退回内存模式。

## 固定 IP 服务器变量

```bash
export TODO_API_KEY="院院通API_KEY"
export CLOUD_API_BASE_URL="https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com"
export TODO_IMPORT_TOKEN="与云托管一致"
export REMOTE_STATE_API_BASE_URL="https://你的Linux状态服务域名"
export REMOTE_STATE_TOKEN="与云托管 REMOTE_STATE_TOKEN 一致"
export TODO_SYNC_LOG_DIR="/var/log/yyt-todo-sync"
```

## 定时同步

Linux 服务器执行：

```bash
sh scripts/register-todo-sync-cron.sh
crontab todo-sync.cron
crontab -l
```

默认每天北京时间：

```text
09:20
17:20
```

## 本地测试

```bash
cd server
npm test
```

## 部署文档

- 腾讯云托管部署：[docs/tencent-cloudbase-deploy.md](docs/tencent-cloudbase-deploy.md)
- 固定 IP 同步脚本：[docs/fixed-ip-sync.md](docs/fixed-ip-sync.md)
