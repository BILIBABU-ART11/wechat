# 院院通阿里云服务器测试部署包

本部署包用于当前无域名测试阶段。它会在阿里云服务器完成：

- 校验公网出口 IPv4 是否为 `120.26.231.85`。
- 自动安装 Node.js 20 和基础工具。
- 创建低权限 `yyt` 服务用户。
- 启动仅监听 `127.0.0.1:3100` 的 JSON 状态服务。
- 安装每天北京时间 `09:20`、`17:20` 的 systemd timer。
- 首次安装后立即拉取一次真实院院通数据。
- 将状态写入 `/opt/yyt-state/yyt-state.json`。
- 将日志写入 `/var/log/yyt-todo-sync`。

测试模式不会连接腾讯云，不会发送微信提醒，也不需要开放 `3100` 端口。

## 上传与安装

将 `yyt-aliyun-test-deploy.tar.gz` 上传到服务器，然后执行：

```bash
tar -xzf yyt-aliyun-test-deploy.tar.gz
cd yyt-aliyun-test-deploy
sudo bash install.sh
```

安装过程中只会要求输入一次院院通 `TODO_API_KEY`，输入内容不会显示在终端。

如需非交互安装：

```bash
sudo TODO_API_KEY='你的APIKey' YYT_RUN_INITIAL_SYNC=true bash install.sh
```

## 验证

```bash
sudo bash diagnose.sh
sudo systemctl status yyt-remote-state.service
sudo systemctl list-timers --all | grep yyt
sudo journalctl -u yyt-todo-sync.service -n 100 --no-pager
```

再次手动同步：

```bash
sudo systemctl start yyt-todo-sync.service
```

查看最新同步结果：

```bash
sudo cat /var/log/yyt-todo-sync/todo-sync-latest.json
```

## 更新

上传新版本部署包并解压后执行：

```bash
sudo bash update.sh
```

更新不会覆盖 `/etc/yyt-*.env`、JSON 数据和日志。

## 卸载

保留数据和密钥：

```bash
sudo bash uninstall.sh
```

永久删除应用、数据、日志和密钥：

```bash
sudo bash uninstall.sh --purge
```

## 临时接通腾讯云和微信提醒

安装包默认只拉取数据，不会调用腾讯云或发送微信消息。无域名测试阶段可显式启用公网 IP + HTTP 联调：

```bash
sudo bash enable-cloud-http.sh --public-ip 120.26.231.85
```

脚本会：

- 把状态服务改为监听 `0.0.0.0:3100`；
- 开启云托管触发和提醒触发；
- 在 `/root/yyt-cloudrun-env.json` 生成权限为 `600` 的腾讯云环境变量片段；
- 重启并检查状态服务，但默认不会立即同步或消耗订阅次数。

之后必须完成：

1. 在阿里云安全组开放入方向 TCP `3100`。
2. 将 `/root/yyt-cloudrun-env.json` 的字段合并到腾讯云托管环境变量并重新部署。
3. 确认云托管 `/health` 中 `storage_mode` 为 `remote-json`。
4. 手动触发一次真实联调：

```bash
sudo bash enable-cloud-http.sh --public-ip 120.26.231.85 --run-now
```

公网 HTTP 不加密 Token 和业务数据，只能用于短期、受控测试。正式使用应改为 HTTPS 或私网链路。
## 后续切换完整模式

取得已备案域名和 HTTPS 后，再完成以下操作：

1. 通过 Nginx 将 HTTPS 转发到 `127.0.0.1:3100`。
2. 把 `/etc/yyt-todo-sync.env` 中的 `REMOTE_STATE_API_BASE_URL` 改为 HTTPS 地址。
3. 将 `CLOUD_TRIGGER_ENABLED` 改为 `true`。
4. 将同一组 `REMOTE_STATE_TOKEN`、`TODO_IMPORT_TOKEN` 和 HTTPS 地址配置到腾讯云托管。
5. 完成数据核对后再将 `TRIGGER_REMINDERS` 改为 `true`。

不要直接将公网 IP 的 HTTP 地址提供给腾讯云，也不要向公网开放端口 `3100`。
