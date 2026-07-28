# 院院通小程序

院院通待办提醒小程序，包含微信小程序前端、腾讯云托管 Express.js 后端，以及固定 IP 服务器定时同步脚本。

## 当前正式架构

```text
固定 IP 服务器
  -> 每天 09:20 / 17:20 请求院院通 API
  -> POST 到腾讯云托管 /api/todo-stat/import

腾讯云托管 Express 后端
  -> 使用 COS JSON 保存当前状态
  -> 小程序按绑定用户 ID 读取自己的待办
  -> 导入成功后触发微信订阅消息

COS
  -> 保存 yyt/yyt-state.json
```

## 关键目录

```text
server/                       Express.js 后端
scripts/sync-todo-to-cloud.js 固定 IP 服务器同步脚本
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

正式环境推荐使用 COS JSON，不需要 MySQL：

```json
{
  "PORT": "80",
  "NODE_ENV": "production",
  "MOCK_MODE": "false",
  "TODO_DATA_SOURCE": "import",
  "STORAGE_MODE": "cos-json",
  "COS_BUCKET": "7072-prod-d5g6lfndn063b2d5d-1455148284",
  "COS_REGION": "ap-shanghai",
  "COS_STATE_KEY": "yyt/yyt-state.json",
  "TODO_IMPORT_TOKEN": "强随机导入密钥",
  "APP_TOKEN_SECRET": "强随机业务Token密钥",
  "REMINDER_SCHEDULE_ENABLED": "false",
  "WECHAT_APP_ID": "wx964c3e4ac820ac37",
  "WECHAT_APP_SECRET": "微信后台获取的 AppSecret",
  "WECHAT_SUBSCRIBE_TEMPLATE_ID": "订阅消息模板ID"
}
```

如果云托管环境没有自动提供 COS 访问凭据，还需要补充：

```json
{
  "COS_SECRET_ID": "腾讯云 SecretId",
  "COS_SECRET_KEY": "腾讯云 SecretKey"
}
```

存储优先级为：`mysql > cos-json > memory`。不配置 MySQL 时会优先使用 COS JSON；COS 也未配置完整时才退回内存模式。

## 固定 IP 服务器变量

```bash
export TODO_API_KEY="院院通API_KEY"
export CLOUD_API_BASE_URL="https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com"
export TODO_IMPORT_TOKEN="与云托管一致"
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
