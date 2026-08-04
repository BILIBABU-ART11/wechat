# API 接口

所有接口返回：

```json
{ "code": 0, "message": "ok", "data": {} }
```

## 登录与用户

- `POST /api/auth/wechat-login`：输入 `{ "code": "wx.login code" }`。
- `POST /api/auth/bind`：输入 `bind_type=user_id`、纯数字 `bind_value` 和登录返回的 bind token。
- `GET /api/user/me`：使用业务 Bearer Token，返回当前用户、订阅和最近同步状态。

业务 Token 只包含 user_id。用户状态不存在时返回 401。

## 待办

- `GET /api/todo-stat/snapshots`：只返回当前登录用户绑定 ID 的数据。
- `GET /api/articles`：首页兼容接口，同样只返回当前用户数据。
- `GET /api/articles/:id`：只允许读取当前用户自己的详情。

### POST /api/todo-stat/import

鉴权：

```text
Authorization: Bearer <TODO_IMPORT_TOKEN>
```

请求：

```json
{
  "batch_id": "20260804-092000-数据摘要",
  "trigger_reminders": true
}
```

完整待办已经由 Linux 写入状态服务，云托管只接收批次号。同一 batch_id 重复提交不会重复发送。

## 订阅

### GET /api/subscribe/config

使用业务 Token。返回模板、字段映射和 10 分钟有效的一次性 request_id：

```json
{
  "template_ids": ["模板ID"],
  "template_fields": {
    "title": "thing1",
    "count": "number2",
    "content": "thing3",
    "date": "date4"
  },
  "request_id": "signed request token"
}
```

### POST /api/subscribe

小程序调用 `wx.requestSubscribeMessage` 后提交：

```json
{
  "request_id": "上一步返回值",
  "raw": {
    "模板ID": "accept"
  }
}
```

后端忽略客户端自行填写的 accepted 和任意模板 ID。request_id 只能使用一次，重放返回 409。

## 提醒

- `GET /api/reminders/status`：普通登录用户查看自己的最近发送状态。
- `POST /api/reminders/run`：仅供运维手动触发，使用 `TODO_IMPORT_TOKEN`，请求必须包含 batch_id。

系统不存在公开飞书 webhook。
