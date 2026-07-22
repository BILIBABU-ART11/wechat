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

在固定 IP 服务器上设置：

```powershell
$env:TODO_API_KEY = "院院通API_KEY"
$env:CLOUD_API_BASE_URL = "https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com"
$env:TODO_IMPORT_TOKEN = "与云托管TODO_IMPORT_TOKEN一致"
```

正式运行建议设置为系统环境变量，而不是只在当前 PowerShell 窗口里设置。

## 手动执行一次

```powershell
cd "C:\path\to\NeuroGaze_MiniProgram"
.\scripts\sync-todo-to-cloud.ps1
```

脚本会：

1. 拉取院院通 `/openapi/todo-stat/snapshots` 全量分页数据。
2. POST 到云托管 `/api/todo-stat/import`。
3. 默认触发云托管提醒任务。
4. 在 `todo-sync-logs/` 保存同步日志。

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

## 验证

导入成功后，绑定用户 ID 后访问小程序首页，应该读取导入数据。

也可以调用云托管接口测试：

```text
POST /api/todo-stat/import
Authorization: Bearer <TODO_IMPORT_TOKEN>
```
