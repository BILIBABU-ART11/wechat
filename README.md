# 院院通小程序

院院通待办提醒系统由微信小程序、腾讯云托管 Express 后端和固定 IP Linux 服务器组成，不需要 MySQL 或 COS。

## 运行流程

```text
Linux 固定 IP 服务器
  -> systemd 在北京时间 09:20 / 17:20 拉取院院通 API
  -> 将完整待办写入本机远程 JSON 状态服务
  -> 只把 batch_id POST 到腾讯云托管

腾讯云托管
  -> 按 batch_id 读取 Linux 上的最新待办
  -> 只向绑定 ID 匹配且有订阅次数的用户发送微信提醒

微信小程序
  -> 微信登录
  -> 绑定纯数字院院通用户 ID
  -> 订阅提醒
  -> 查看自己的最新待办
```

状态文件默认为 `/opt/yyt-state/yyt-state.json`，使用原子替换和 `.bak` 备份。容器重启不会影响用户绑定、订阅和最新待办。

## 关键文件

- `server/`：腾讯云托管 Express 后端。
- `scripts/remote-state-server.js`：Linux JSON 状态服务。
- `scripts/sync-todo-to-cloud.js`：院院通数据同步脚本。
- `scripts/yyt-todo-sync*.example`：systemd 服务、定时器和环境变量示例。
- `pages/`：微信小程序页面。

## 本地验证

```powershell
$env:Path="C:\Users\Zhengquanbu\tools\nodejs;$env:Path"
npm run preflight
npm test
```

## 生产配置

云托管使用：

```text
MOCK_MODE=false
TODO_DATA_SOURCE=import
STORAGE_MODE=remote-json
REMINDER_SCHEDULE_ENABLED=false
```

完整环境变量见 [docs/env-example.md](docs/env-example.md)。Linux 部署步骤见 [docs/fixed-ip-sync.md](docs/fixed-ip-sync.md)，腾讯云托管步骤见 [docs/tencent-cloudbase-deploy.md](docs/tencent-cloudbase-deploy.md)。

所有真实密钥只放在云托管环境变量或 Linux 的 `/etc/yyt-*.env` 文件中，禁止提交到 GitHub。
