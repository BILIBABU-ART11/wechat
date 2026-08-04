# 固定 IP Linux 部署

## 1. 更新代码和依赖

```bash
cd /opt/NeuroGaze_MiniProgram
git pull origin master
npm install --omit=dev
sudo useradd --system --home /opt/NeuroGaze_MiniProgram --shell /usr/sbin/nologin yyt 2>/dev/null || true
sudo mkdir -p /opt/yyt-state /var/log/yyt-todo-sync
sudo chown -R yyt:yyt /opt/NeuroGaze_MiniProgram /opt/yyt-state /var/log/yyt-todo-sync
```

## 2. 配置状态服务

```bash
sudo cp scripts/yyt-remote-state.env.example /etc/yyt-remote-state.env
sudo cp scripts/yyt-remote-state.service.example /etc/systemd/system/yyt-remote-state.service
sudo chown root:yyt /etc/yyt-remote-state.env
sudo chmod 640 /etc/yyt-remote-state.env
sudo systemctl daemon-reload
sudo systemctl enable --now yyt-remote-state.service
curl http://127.0.0.1:3100/health
```

编辑 `/etc/yyt-remote-state.env`，设置强随机 `REMOTE_STATE_TOKEN`。用 Nginx 或现有网关把 `127.0.0.1:3100` 反向代理为 HTTPS 域名，云托管只访问该 HTTPS 地址。

升级前请备份现有文件：

```bash
sudo cp /opt/yyt-state/yyt-state.json /opt/yyt-state/yyt-state.before-v2.json 2>/dev/null || true
```

首次读写会自动把 v1 数据迁移为 v2，不会清空绑定和订阅。

## 3. 配置同步任务

```bash
sudo cp scripts/yyt-todo-sync.env.example /etc/yyt-todo-sync.env
sudo cp scripts/yyt-todo-sync.service.example /etc/systemd/system/yyt-todo-sync.service
sudo cp scripts/yyt-todo-sync-morning.timer.example /etc/systemd/system/yyt-todo-sync-morning.timer
sudo cp scripts/yyt-todo-sync-evening.timer.example /etc/systemd/system/yyt-todo-sync-evening.timer
sudo chown root:yyt /etc/yyt-todo-sync.env
sudo chmod 640 /etc/yyt-todo-sync.env
```

编辑 `/etc/yyt-todo-sync.env`，确保：

- `TODO_API_KEY` 是院院通 API Key。
- `TODO_IMPORT_TOKEN` 与云托管一致。
- `REMOTE_STATE_TOKEN` 与状态服务和云托管一致。
- `REMOTE_STATE_API_BASE_URL` 是 Linux 状态服务 HTTPS 地址。

先手动验证：

```bash
sudo systemctl start yyt-todo-sync.service
sudo systemctl status yyt-todo-sync.service
sudo journalctl -u yyt-todo-sync.service -n 100 --no-pager
```

再启用北京时间定时器：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now yyt-todo-sync-morning.timer
sudo systemctl enable --now yyt-todo-sync-evening.timer
systemctl list-timers 'yyt-todo-sync-*'
```

两个 timer 明确使用 `Asia/Shanghai`，分别在每天 09:20 和 17:20 运行。systemd 不会并行启动同一个 oneshot service，单次任务最多运行 15 分钟。

旧的 `register-todo-sync-cron.sh` 和 `sync-todo-to-cloud.ps1` 已弃用，不再把密钥写入 cron 文件；正式同步入口只有 `node scripts/sync-todo-to-cloud.js`。

## 4. 日志与恢复

```bash
sudo journalctl -u yyt-remote-state.service -n 100 --no-pager
sudo journalctl -u yyt-todo-sync.service -n 100 --no-pager
sudo tail -n 100 /var/log/yyt-todo-sync/todo-sync-latest.log
```

状态文件：

```text
/opt/yyt-state/yyt-state.json
/opt/yyt-state/yyt-state.json.bak
```

主文件损坏时服务自动读取备份；主文件和备份同时损坏时服务返回错误，不会生成空状态覆盖数据。
