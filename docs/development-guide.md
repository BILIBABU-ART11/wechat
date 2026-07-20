# Development Guide

## Mini Program

Use WeChat Developer Tools to import the project root `NeuroGaze_MiniProgram`.

The frontend source is organized as:

```text
pages/        page logic and UI
components/   reusable cards, badges, loading and empty states
services/     request wrapper, auth service, API service, mock service
utils/        constants, storage, formatting, login guard, normalization helper
```

The MVP starts in backend-first mode. Important files:

- `utils/constants.js`: `REQUEST_MODE`, `MOCK_ENABLED`, `ENABLE_MOCK_FALLBACK`, `API_BASE_URL`, status values, category filters.
- `services/request.js`: wraps `wx.request`, token header, loading, 401 redirect, backend-first flow, mock fallback.
- `services/mock.js`: frontend fallback mock data and endpoint simulation.
- `services/api.js`: business API methods with response normalization.
- `utils/authGuard.js`: shared login guard for protected pages.
- `utils/normalize.js`: formats project and reminder time fields before rendering.

## Backend

Use Node.js 18 or newer. The backend relies on the built-in `fetch`, `URL`, and `AbortController` APIs.

Install and start:

```bash
cd server
npm install
npm run dev
```

Run smoke tests:

```bash
npm test
```

## Switching To Real Services

1. Copy `server/.env.example` to `server/.env`.
2. Set `MOCK_MODE=false`.
3. Fill `TODO_API_BASE_URL` and `TODO_API_KEY` from the 院院通 API document. The backend sends `Authorization: Bearer <TODO_API_KEY>`.
4. Keep `TODO_DATA_SOURCE=api` for normal operation. Use `TODO_DATA_SOURCE=file` only for local snapshot testing.
5. Make sure the backend server出口 IP is added to the 院院通 IP whitelist.
6. Fill WeChat and Feishu credentials in `.env` when those integrations are enabled.
7. Replace mock-only login token logic with JWT or session-backed token storage before production release.
8. Set frontend `API_BASE_URL` to the deployed backend HTTPS URL.
9. Keep frontend `ENABLE_MOCK_FALLBACK` as `false` so API failures do not display mock records.
10. Keep frontend `MOCK_ENABLED` as `false`.

When `MOCK_MODE=false`, these Mini Program backend endpoints read from the 院院通待办快照 API:

- `GET /api/dashboard/summary`
- `GET /api/articles`
- `GET /api/articles/:id`
- `GET /api/messages`
- `GET /api/todo-stat/snapshots`

The external source endpoint is `GET /openapi/todo-stat/snapshots` with query parameters `page`, `pageSize`, and optional `snapshotDate`.

## Scheduled Reminders

The backend starts a lightweight scheduler from `server/src/index.js`.

Default schedule:

```env
REMINDER_SCHEDULE_ENABLED=true
REMINDER_SCHEDULE_TIMES=09:00,17:00
REMINDER_TIME_ZONE=Asia/Shanghai
REMINDER_SCHEDULE_POLL_MS=60000
REMINDER_FETCH_PAGE_SIZE=100
REMINDER_SEND_ONLY_PENDING=true
```

At each configured time, the job fetches all todo snapshots, creates reminder-center messages for rows where `pendingCount > 0`, and attempts to send WeChat subscription messages to users who granted subscription permission.

Manual endpoints:

```text
GET  /api/reminders/status
POST /api/reminders/run
```

Real WeChat push requires `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, and `WECHAT_SUBSCRIBE_TEMPLATE_ID`. The Mini Program reads template IDs from `GET /api/subscribe/config` before calling `wx.requestSubscribeMessage`.

## Validation

From the project root:

```bash
node scripts/validate-structure.js
```

From the backend directory:

```bash
npm test
```
