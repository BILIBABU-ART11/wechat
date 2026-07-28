# 固定 IP 服务器定时同步方案

## 架构

```text
固定 IP 云服务器
  -> 定时请求院院通 API
  -> POST 到腾讯云托管导入接口

腾讯云托管
  -> 保存导入的待办快照
  -> 小程序读取导入数据
  -> 导入后可触发提醒任务
```

这样院院通白名单只需要加入固定 IP 云服务器的公网 IP，腾讯云托管不再直接请求院院通 API。

## 云托管环境变量

云托管建议改为：

```json
{
  "PORT": "80",
  "NODE_ENV": "production",
  "MOCK_MODE": "false",
  "ALLOWED_ORIGINS": "*",
  "ENABLE_EGRESS_IP_CHECK": "false",

  "TODO_DATA_SOURCE": "import",
  "TODO_IMPORT_TOKEN": "替换为强随机导入密钥",

  "REMINDER_SCHEDULE_ENABLED": "true",
  "REMINDER_SCHEDULE_TIMES": "09:00,17:00",
  "REMINDER_TIME_ZONE": "Asia/Shanghai",
  "REMINDER_SCHEDULE_POLL_MS": "60000",
  "REMINDER_FETCH_PAGE_SIZE": "100",
  "REMINDER_SEND_ONLY_PENDING": "true",

  "MYSQL_ADDRESS": "云托管MySQL地址，例如 10.x.x.x:3306",
  "MYSQL_USERNAME": "root",
  "MYSQL_PASSWORD": "云托管MySQL密码",
  "MYSQL_DATABASE": "nodejs_demo",

  "WECHAT_APP_ID": "wx964c3e4ac820ac37",
  "WECHAT_APP_SECRET": "",
  "WECHAT_SUBSCRIBE_TEMPLATE_ID": "",
  "WECHAT_SUBSCRIBE_TEMPLATE_PAGE": "pages/index/index",

  "SUBSCRIBE_TEMPLATE_IDS": "",
  "APP_TOKEN_SECRET": "替换为强随机业务Token密钥"
}
```

`TODO_IMPORT_TOKEN` 必须同时配置在云托管和固定 IP 服务器脚本里，两边一致。

如果暂时不配置 MySQL，云托管会退回内存缓存，但容器重启后数据会丢失，不建议生产使用。

## 固定 IP 服务器环境变量

如果固定 IP 服务器是 Linux，建议用 Node.js 脚本，先设置：

```bash
export TODO_API_KEY="院院通API_KEY"
export CLOUD_API_BASE_URL="https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com"
export TODO_IMPORT_TOKEN="与云托管TODO_IMPORT_TOKEN一致"
```

如果固定 IP 服务器是 Windows，也可以在 PowerShell 中设置：

```powershell
$env:TODO_API_KEY = "院院通API_KEY"
$env:CLOUD_API_BASE_URL = "https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com"
$env:TODO_IMPORT_TOKEN = "与云托管TODO_IMPORT_TOKEN一致"
```

正式运行建议设置为系统环境变量，而不是只在当前 PowerShell 窗口里设置。

## 手动执行一次

Linux / macOS / 通用 Node.js：

```bash
cd /path/to/NeuroGaze_MiniProgram
node scripts/sync-todo-to-cloud.js
```

Windows PowerShell：

```powershell
cd "C:\path\to\NeuroGaze_MiniProgram"
.\scripts\sync-todo-to-cloud.ps1
```

脚本会：

1. 拉取院院通 `/openapi/todo-stat/snapshots` 全量分页数据。
2. POST 到云托管 `/api/todo-stat/import`。
3. 默认触发云托管提醒任务。
4. 在 `todo-sync-logs/` 保存同步日志。

## 日志说明

每次运行都会写入：

```text
todo-sync-logs/todo-sync-YYYYMMDD-HHmmss.log
todo-sync-logs/todo-sync-YYYYMMDD-HHmmss.json
```

同时会覆盖最新日志：

```text
todo-sync-logs/todo-sync-latest.log
todo-sync-logs/todo-sync-latest.json
```

文本日志适合直接查看：

```bash
tail -n 100 todo-sync-logs/todo-sync-latest.log
```

结构化 JSON 日志适合排查接口返回、耗时、分页数量和导入结果：

```bash
cat todo-sync-logs/todo-sync-latest.json
```

日志会记录：

- 任务开始和结束时间
- Node 版本、运行目录、进程 ID
- 院院通 API 每一页请求的 URL、状态码、耗时、返回条数
- 全量拉取总页数、总条数、总耗时
- POST 到云托管导入接口的状态码、耗时、导入结果
- 触发提醒后的发送统计
- 失败时的错误信息和堆栈

日志不会记录 `TODO_API_KEY` 或 `TODO_IMPORT_TOKEN` 的明文，只记录是否已配置。

## 注册 Windows 定时任务

以管理员身份打开 PowerShell：

```powershell
cd "C:\path\to\NeuroGaze_MiniProgram"
.\scripts\register-todo-sync-task.ps1
```

默认注册两个任务：

```text
YYT Todo Sync 0900
YYT Todo Sync 1700
```

分别每天 09:00 和 17:00 执行。

## 注册 Linux cron 定时任务

先确认当前 shell 里已经设置：

```bash
export TODO_API_KEY="院院通API_KEY"
export CLOUD_API_BASE_URL="https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com"
export TODO_IMPORT_TOKEN="与云托管TODO_IMPORT_TOKEN一致"
```

然后执行：

```bash
cd /path/to/NeuroGaze_MiniProgram
sh scripts/register-todo-sync-cron.sh
crontab todo-sync.cron
```

默认每天 09:00 和 17:00 执行。请确认服务器系统时区为 `Asia/Shanghai`，或在服务器上配置北京时间。

## 验证

导入成功后，绑定用户 ID 后访问小程序首页，应该读取导入数据。

也可以调用云托管接口测试：

```text
POST /api/todo-stat/import
Authorization: Bearer <TODO_IMPORT_TOKEN>
```
