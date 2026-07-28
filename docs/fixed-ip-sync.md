# 固定 IP 服务器定时同步方案

## 架构

```text
固定 IP 服务器
  -> 每天 09:20 / 17:20 请求院院通 API
  -> POST 到腾讯云托管导入接口

腾讯云托管
  -> 通过 remote-json 读写 Linux 状态服务
  -> 小程序读取导入数据
  -> 导入成功后触发订阅消息提醒

Linux 状态服务
  -> 保存 /opt/yyt-state/yyt-state.json
```

这样院院通白名单只需要加入固定 IP 服务器的公网 IP，腾讯云托管不再直接请求院院通 API。

## 云托管环境变量

```json
{
  "PORT": "80",
  "NODE_ENV": "production",
  "MOCK_MODE": "false",
  "ALLOWED_ORIGINS": "*",
  "ENABLE_EGRESS_IP_CHECK": "false",

  "TODO_DATA_SOURCE": "import",
  "TODO_IMPORT_TOKEN": "替换为强随机导入密钥",

  "STORAGE_MODE": "remote-json",
  "REMOTE_STATE_API_BASE_URL": "https://你的Linux状态服务域名",
  "REMOTE_STATE_TOKEN": "替换为强随机远程状态密钥",
  "REMOTE_STATE_TIMEOUT_MS": "10000",

  "REMINDER_SCHEDULE_ENABLED": "false",
  "REMINDER_SCHEDULE_TIMES": "09:20,17:20",
  "REMINDER_TIME_ZONE": "Asia/Shanghai",
  "REMINDER_SCHEDULE_POLL_MS": "60000",
  "REMINDER_FETCH_PAGE_SIZE": "100",
  "REMINDER_SEND_ONLY_PENDING": "true",

  "WECHAT_APP_ID": "wx964c3e4ac820ac37",
  "WECHAT_APP_SECRET": "微信公众平台获取的 AppSecret",
  "WECHAT_SUBSCRIBE_TEMPLATE_ID": "订阅消息模板ID",
  "WECHAT_SUBSCRIBE_TEMPLATE_PAGE": "pages/index/index",

  "SUBSCRIBE_TEMPLATE_IDS": "",
  "APP_TOKEN_SECRET": "替换为强随机业务Token密钥"
}
```

Linux 状态服务启动：

```bash
cd /path/to/NeuroGaze_MiniProgram
export REMOTE_STATE_TOKEN="与云托管 REMOTE_STATE_TOKEN 一致"
export REMOTE_STATE_FILE="/opt/yyt-state/yyt-state.json"
export REMOTE_STATE_PORT=3100
node scripts/remote-state-server.js
```

也可以参考 `scripts/yyt-remote-state.service.example` 配置 systemd 常驻运行。

## 固定 IP Linux 服务器环境变量

```bash
export TODO_API_KEY="院院通API_KEY"
export CLOUD_API_BASE_URL="https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com"
export TODO_IMPORT_TOKEN="与云托管TODO_IMPORT_TOKEN一致"
export REMOTE_STATE_API_BASE_URL="https://你的Linux状态服务域名"
export REMOTE_STATE_TOKEN="与云托管REMOTE_STATE_TOKEN一致"
export TODO_SYNC_LOG_DIR="/var/log/yyt-todo-sync"
```

## 手动运行一次

```bash
cd /path/to/NeuroGaze_MiniProgram
node scripts/sync-todo-to-cloud.js
```

脚本会：

1. 分页拉取院院通 `/openapi/todo-stat/snapshots`。
2. 如果配置了 `REMOTE_STATE_API_BASE_URL`，先 POST 到 Linux 状态服务 `/todo/snapshots`。
3. POST 到云托管 `/api/todo-stat/import`。
4. 默认携带 `trigger_reminders=true`，导入后触发提醒。
5. 写入详细日志。

## 注册 Linux cron

确认当前 shell 已设置环境变量后执行：

```bash
cd /path/to/NeuroGaze_MiniProgram
sh scripts/register-todo-sync-cron.sh
crontab todo-sync.cron
crontab -l
```

应看到：

```cron
20 9 * * * ...
20 17 * * * ...
```

请确认服务器系统时区为 `Asia/Shanghai`，或 cron 已按北京时间配置。

## 日志

每次运行会写入：

```text
todo-sync-logs/todo-sync-YYYYMMDD-HHmmss.log
todo-sync-logs/todo-sync-YYYYMMDD-HHmmss.json
todo-sync-logs/todo-sync-latest.log
todo-sync-logs/todo-sync-latest.json
```

查看最新日志：

```bash
tail -n 100 todo-sync-logs/todo-sync-latest.log
cat todo-sync-logs/todo-sync-latest.json
```

日志不会记录 `TODO_API_KEY` 或 `TODO_IMPORT_TOKEN` 明文。

## 云托管导入接口

```text
POST /api/todo-stat/import
Authorization: Bearer <TODO_IMPORT_TOKEN>
```

导入成功后，小程序首页会读取当前绑定用户 ID 下的待办数据。
