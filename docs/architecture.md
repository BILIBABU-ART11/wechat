# Architecture

NeuroGaze is a lightweight tender progress reminder Mini Program. Users view tender project stage, deadline, reminder reason, and in-app reminders. They do not process records inside the Mini Program.

```text
WeChat Mini Program
  -> NeuroGaze backend API
    -> WeChat OpenAPI
    -> Feishu OpenAPI / Bitable
    -> subscription message sender
```

The Mini Program never calls Feishu OpenAPI directly and never stores real secrets.

## Login And Binding

1. Mini Program calls `wx.login` and receives `code`.
2. Mini Program sends `code` to `POST /api/auth/wechat-login`.
3. Backend calls WeChat `code2Session` and receives `openid` plus `session_key`.
4. Backend never returns `session_key` to the Mini Program.
5. Backend checks whether `openid` is already bound to an internal user.
6. If bound, backend returns a business token, user profile, role, and permissions.
7. If not bound, backend returns `need_bind=true`.
8. User enters invite code, enterprise email, or phone number.
9. Backend validates the binding value and binds `openid` to the internal user.
10. All later requests use `Authorization: Bearer <token>`.

## Feishu Integration

The backend owns all Feishu integration work:

- Fetch and cache `tenant_access_token`.
- Read Feishu Bitable tender project records.
- Normalize fields into Mini Program-friendly project objects.
- Sync project stage, deadline, reminder reason, read state, and update time.
- Handle Feishu API errors, rate limits, retries, and field mapping.

## Feishu Field Mapping Example

| Internal Field | Feishu Field |
| --- | --- |
| `record_id` | `record_id` |
| `title` | `title` |
| `source` | `source` |
| `original_url` | `original_url` |
| `company` | `company` |
| `product` | `product` |
| `category` | `category` |
| `ai_score` | `ai_score` |
| `ai_summary` | `ai_summary` |
| `publish_time` | `publish_time` |
| `deadline` | `deadline` |
| `status` | `status` |
| `owner` | `owner` |
| `comment` | `comment` |
| `reminder_reason` | `reminder_reason` |
| `procurement_unit` | `procurement_unit` |
| `updated_at` | `updated_at` |

## Reminder Design

There are two reminder channels:

1. In-app reminder center: tender deadlines, stage changes, and new project notices.
2. WeChat subscription messages: deadline-critical or stage-change reminders that require timely awareness.

Template IDs must be configured on the backend through environment variables, not hardcoded in frontend code.
