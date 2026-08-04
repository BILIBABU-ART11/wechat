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

## 后续切换完整模式

取得已备案域名和 HTTPS 后，再完成以下操作：

1. 通过 Nginx 将 HTTPS 转发到 `127.0.0.1:3100`。
2. 把 `/etc/yyt-todo-sync.env` 中的 `REMOTE_STATE_API_BASE_URL` 改为 HTTPS 地址。
3. 将 `CLOUD_TRIGGER_ENABLED` 改为 `true`。
4. 将同一组 `REMOTE_STATE_TOKEN`、`TODO_IMPORT_TOKEN` 和 HTTPS 地址配置到腾讯云托管。
5. 完成数据核对后再将 `TRIGGER_REMINDERS` 改为 `true`。

不要直接将公网 IP 的 HTTP 地址提供给腾讯云，也不要向公网开放端口 `3100`。
