# API Design

All responses use:

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

Authenticated endpoints require `Authorization: Bearer <token>`.

## POST /api/auth/wechat-login

Request:

```json
{ "code": "wx-login-code" }
```

Response when not bound:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "",
    "need_bind": true,
    "bind_token": "mock-bind-session",
    "user": null
  }
}
```

## POST /api/auth/bind

Request:

```json
{
  "bind_type": "user_id",
  "bind_value": "1858541407738915"
}
```

Only `bind_type=user_id` is accepted. Email, phone, invite code, or any non-numeric value must be rejected by the backend.

Response:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "mock-token-u_mock_001",
    "user": {
      "id": "u_mock_001",
      "internal_account": "1858541407738915",
      "role": "analyst",
      "bound": true
    }
  }
}
```

## GET /api/dashboard/summary

Returns today reminder counts, urgent reminder count, active project count, unread reminder count, and recent urgent projects.

When `MOCK_MODE=false`, this summary is derived from the 院院通待办统计快照 API.

## GET /api/articles

The endpoint name is kept for MVP compatibility. UI treats these records as待办提醒 cards.

When `MOCK_MODE=false`, the backend calls:

```text
GET https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73/openapi/todo-stat/snapshots
Authorization: Bearer <TODO_API_KEY>
```

Query parameters:

| Name | Type | Description |
| --- | --- | --- |
| `category` | string | For example `院内招标` |
| `score` | number/string | Minimum reminder level, for example `4` |
| `status` | string | `new`, `evaluating`, `materials`, `submit_due`, `submitted`, `opening`, `follow_up`, `completed`, `abandoned` |
| `keyword` | string | Search project title, purchaser, product, and summary |
| `page` | number | Page number |
| `page_size` | number | Page size |
| `snapshotDate` | string | Optional snapshot date, format `YYYY-MM-DD` |

Response item:

```json
{
  "id": "b0c7aeef-f7cd-4b3a-a655-b08c29a9d27b",
  "record_id": "b0c7aeef-f7cd-4b3a-a655-b08c29a9d27b",
  "title": "魏家允 待办提醒",
  "source": "院院通销售管理系统",
  "company": "魏家允",
  "product": "49 条待办",
  "category": "待办统计",
  "ai_score": 5,
  "deadline": "2026-07-14T23:59:59+08:00",
  "status": "pending",
  "reminder_reason": "您还有49条待办未处理，请您尽快处理，谢谢"
}
```

## GET /api/articles/:id

Returns the read-only tender project detail used by the Mini Program detail page.

## GET /api/messages

Returns in-app reminders such as deadline reminders, stage changes, and new project reminders.

When `MOCK_MODE=false`, messages are generated from待办快照 rows where `pendingCount > 0`.

## GET /api/todo-stat/snapshots

Returns the raw待办统计快照 list through the Mini Program backend.

Query parameters:

| Name | Type | Description |
| --- | --- | --- |
| `page` | number | Page number, default `1` |
| `pageSize` | number | Page size, max `100`, default `20` |
| `snapshotDate` | string | Optional snapshot date, format `YYYY-MM-DD` |

Response item:

```json
{
  "id": "b0c7aeef-f7cd-4b3a-a655-b08c29a9d27b",
  "snapshotDate": "2026-07-14",
  "userId": "1858541407738915",
  "userName": "魏家允",
  "pendingCount": 49,
  "content": "您还有49条待办未处理，请您尽快处理，谢谢"
}
```

## PATCH /api/messages/:id/read

Marks one reminder as read.

## POST /api/subscribe

Saves the user's subscription authorization result.

## GET /api/subscribe/config

Returns subscription template IDs configured on the backend. The Mini Program uses this before calling `wx.requestSubscribeMessage`.

Response:

```json
{
  "template_ids": ["template-id-from-wechat"]
}
```

## GET /api/reminders/status

Returns scheduler status and the most recent reminder job result.

## POST /api/reminders/run

Manually runs the same workflow as the 09:00 and 17:00 scheduler: fetch todo snapshots, create reminder-center messages, and attempt WeChat subscription-message sends.

## POST /api/webhooks/feishu-record-created

Reserved for Feishu tender-created or stage-change triggers.
