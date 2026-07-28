# 腾讯云托管上线配置

## 后端部署

本项目是 Express.js 后端，腾讯云托管语言模板选择 **Express.js**。

仓库根目录已提供：

```text
Dockerfile
container.config.json
package.json
index.js
```

根目录启动会实际加载 `server/src/index.js`。模板流水线默认容器端口使用：

```text
80
```

## 云托管环境变量

正式环境建议使用下面配置。密钥不要提交到 GitHub，只放在云托管环境变量里。

```json
{
  "PORT": "80",
  "NODE_ENV": "production",
  "MOCK_MODE": "false",
  "ALLOWED_ORIGINS": "*",
  "ENABLE_EGRESS_IP_CHECK": "false",

  "TODO_DATA_SOURCE": "import",
  "TODO_IMPORT_TOKEN": "替换为强随机导入密钥",
  "TODO_API_BASE_URL": "https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73",
  "TODO_API_KEY": "",
  "TODO_API_TIMEOUT_MS": "20000",

  "REMINDER_SCHEDULE_ENABLED": "false",
  "REMINDER_SCHEDULE_TIMES": "09:20,17:20",
  "REMINDER_TIME_ZONE": "Asia/Shanghai",
  "REMINDER_SCHEDULE_POLL_MS": "60000",
  "REMINDER_FETCH_PAGE_SIZE": "100",
  "REMINDER_SEND_ONLY_PENDING": "true",

  "WECHAT_APP_ID": "wx964c3e4ac820ac37",
  "WECHAT_APP_SECRET": "微信公众平台获取的AppSecret",
  "WECHAT_SUBSCRIBE_TEMPLATE_ID": "订阅消息模板ID",
  "WECHAT_SUBSCRIBE_TEMPLATE_PAGE": "pages/index/index",

  "SUBSCRIBE_TEMPLATE_IDS": "",
  "APP_TOKEN_SECRET": "替换为强随机业务Token密钥"
}
```

说明：

- `TODO_DATA_SOURCE=import` 表示云托管只读取固定 IP 服务器导入的数据。
- `REMINDER_SCHEDULE_ENABLED=false` 表示云托管不自己定时拉取，避免和固定 IP 服务器重复触发。
- 固定 IP 服务器导入数据时会带 `trigger_reminders=true`，导入成功后自动触发提醒发送。
- `TODO_IMPORT_TOKEN` 必须和固定 IP 服务器脚本中的值一致。
- MySQL 可选。没有 MySQL 时使用内存模式，只保留当前容器生命周期内的数据、订阅和日志。

如后续需要持久化，再补充：

```json
{
  "MYSQL_ADDRESS": "云托管MySQL地址，例如 10.x.x.x:3306",
  "MYSQL_USERNAME": "root",
  "MYSQL_PASSWORD": "云托管MySQL密码",
  "MYSQL_DATABASE": "nodejs_demo"
}
```

## 小程序域名配置

云托管部署成功后，把 HTTPS 域名配置到微信公众平台：

```text
开发管理 -> 开发设置 -> 服务器域名 -> request 合法域名
```

小程序端的云托管地址在：

```text
utils/constants.js
```

确认 `API_BASE_URLS.cloud` 是当前云托管域名，并保持：

```js
const API_ENV = 'cloud';
```

## 健康检查

后端健康检查：

```text
https://你的云托管域名/health
```

查看同步和提醒状态需要登录后调用：

```text
GET /api/reminders/status
```

临时排查出口 IP 时才开启：

```json
{
  "ENABLE_EGRESS_IP_CHECK": "true"
}
```

排查完请改回 `false` 并重新部署。
