# 院院通小程序

院院通待办提醒小程序，包含微信小程序前端、腾讯云托管 Express.js 后端，以及固定 IP 服务器定时同步脚本。

## 当前正式架构

```text
固定 IP 云服务器
  -> 每天 09:20 / 17:20 请求院院通 API
  -> POST 到腾讯云托管 /api/todo-stat/import

腾讯云托管 Express 后端
  -> 保存用户绑定、订阅状态、待办快照、导入日志、发送日志
  -> 小程序按绑定用户 ID 读取自己的待办
  -> 导入成功后触发微信订阅消息

微信小程序
  -> 微信登录
  -> 绑定院院通用户 ID
  -> 订阅提醒
  -> 查看首页和我的
```

## 目录

```text
server/                       Express.js 后端
scripts/sync-todo-to-cloud.js 固定 IP 服务器同步脚本
scripts/register-todo-sync-cron.sh Linux cron 注册脚本
pages/                        小程序页面
services/                     小程序请求与认证服务
utils/                        小程序工具与常量
docs/                         部署和同步说明
```

## 后端关键接口

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

## 正式环境变量

云托管正式环境建议：

```json
{
  "NODE_ENV": "production",
  "MOCK_MODE": "false",
  "TODO_DATA_SOURCE": "import",
  "TODO_IMPORT_TOKEN": "强随机导入密钥",
  "REMINDER_SCHEDULE_ENABLED": "false",
  "REMINDER_SCHEDULE_TIMES": "09:20,17:20",
  "REMINDER_TIME_ZONE": "Asia/Shanghai",
  "WECHAT_APP_ID": "wx964c3e4ac820ac37",
  "WECHAT_APP_SECRET": "微信公众平台获取的AppSecret",
  "WECHAT_SUBSCRIBE_TEMPLATE_ID": "订阅消息模板ID",
  "APP_TOKEN_SECRET": "强随机业务Token密钥"
}
```

MySQL 是可选项。没有配置 `MYSQL_ADDRESS` / `MYSQL_USERNAME` / `MYSQL_PASSWORD` 时，后端会使用内存模式：

- 可以展示最近一次导入的数据。
- 可以完成当前容器生命周期内的绑定、订阅和提醒。
- 容器重启、缩容到 0、重新部署后，内存中的绑定、订阅和日志会丢失。
- 用户本机已保存的登录 token 仍可用于读取自己绑定 ID 下的数据，但微信订阅状态需要用户重新点击订阅。

固定 IP Linux 服务器：

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

后端 smoke test：

```bash
cd server
npm test
```

如果本机没有全局 Node，可使用已解压的免安装 Node 执行测试。

## 部署文档

- 腾讯云托管部署：[docs/tencent-cloudbase-deploy.md](docs/tencent-cloudbase-deploy.md)
- 固定 IP 同步脚本：[docs/fixed-ip-sync.md](docs/fixed-ip-sync.md)
