# Architecture

院院通小程序是一个轻量待办提醒工具。用户登录后绑定自己的院院通用户 ID，只能看到该 ID 下的最近一次待办统计，并可主动订阅微信提醒。

```text
WeChat Mini Program
  -> Tencent CloudBase Express API
    -> COS JSON state file
    -> WeChat OpenAPI

Fixed IP Server
  -> YYT OpenAPI
  -> Tencent CloudBase import API
```

## Login And Binding

1. Mini Program calls `wx.login` and receives `code`.
2. Mini Program sends `code` to `POST /api/auth/wechat-login`.
3. Backend calls WeChat `code2Session` and receives `openid` plus `session_key`.
4. Backend never returns `session_key` to the Mini Program.
5. Backend checks whether `openid` is already bound to a YYT user ID.
6. If bound, backend returns a business token and user profile.
7. If not bound, backend returns `need_bind=true` and a short-lived bind token.
8. User enters a numeric YYT user ID.
9. Backend validates the value and binds `openid` to that ID.
10. All later requests use `Authorization: Bearer <token>`.

Only numeric YYT user IDs are accepted. Phone numbers, email addresses, and other binding paths are rejected.

## Data Sync

The Tencent CloudBase backend does not call the YYT API directly in production. A fixed IP server pulls YYT data twice per day and imports the result into CloudBase:

```text
POST /api/todo-stat/import
Authorization: Bearer <TODO_IMPORT_TOKEN>
```

The import replaces the latest snapshot in COS JSON. The Mini Program always filters snapshots by the logged-in user's bound YYT user ID.

## Storage

Storage priority:

```text
mysql > cos-json > memory
```

Current recommended mode:

```env
STORAGE_MODE=cos-json
COS_BUCKET=...
COS_REGION=ap-shanghai
COS_STATE_KEY=yyt/yyt-state.json
```

The COS JSON file stores only current operational state:

- User binding records
- Subscription authorization state
- Latest todo snapshots
- Recent import runs
- Recent reminder send logs

It does not keep long-term history.

## Reminder Design

WeChat reminders use Mini Program subscription messages:

1. User taps the subscribe button in the Mini Program.
2. Mini Program calls `wx.requestSubscribeMessage`.
3. Backend saves the accepted template ID and increments `remaining_count`.
4. After each successful import, backend finds users whose bound YYT ID matches a pending snapshot.
5. Backend sends a subscription message only when `pendingCount > 0` and `remaining_count > 0`.
6. On successful send, backend decrements `remaining_count`.

Template IDs and app secrets must be configured on the backend through environment variables, not hardcoded in frontend code.
