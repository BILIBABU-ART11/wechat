# 环境变量

## 腾讯云托管

```json
{
  "PORT": "80",
  "NODE_ENV": "production",
  "MOCK_MODE": "false",
  "ALLOWED_ORIGINS": "*",
  "ENABLE_EGRESS_IP_CHECK": "false",

  "TODO_DATA_SOURCE": "import",
  "TODO_SAMPLE_FALLBACK_ENABLED": "true",
  "TODO_IMPORT_TOKEN": "替换为强随机导入密钥",

  "STORAGE_MODE": "remote-json",
  "REMOTE_STATE_API_BASE_URL": "https://你的Linux状态服务域名",
  "REMOTE_STATE_TOKEN": "替换为强随机远程状态密钥",
  "REMOTE_STATE_TIMEOUT_MS": "10000",

  "REMINDER_SCHEDULE_ENABLED": "false",
  "REMINDER_TIME_ZONE": "Asia/Shanghai",
  "REMINDER_FETCH_PAGE_SIZE": "100",
  "REMINDER_SEND_ONLY_PENDING": "true",

  "WECHAT_APP_ID": "wx964c3e4ac820ac37",
  "WECHAT_APP_SECRET": "微信公众平台AppSecret",
  "WECHAT_API_BASE_URL": "http://api.weixin.qq.com",
  "WECHAT_SUBSCRIBE_TEMPLATE_ID": "5R4eJ63vK_DNuMgeNnr4ffHxcOgRFX5c1Pz51KXeH-A",
  "WECHAT_SUBSCRIBE_TEMPLATE_PAGE": "pages/index/index",
  "WECHAT_SUBSCRIBE_TEMPLATE_FIELDS": "{\"time\":\"time11\",\"content\":\"thing1\"}",

  "APP_TOKEN_SECRET": "替换为强随机业务Token密钥"
}
```

`WECHAT_SUBSCRIBE_TEMPLATE_FIELDS` 的值必须和微信公众平台模板详情中的字段名完全一致。当前“待办事项提醒”模板使用 `time11` 和 `thing1`。

微信云托管会把 `api.weixin.qq.com` 解析到开放接口服务的私有链路，因此云端使用 `http://api.weixin.qq.com`；本地开发保持默认 HTTPS。

`TODO_SAMPLE_FALLBACK_ENABLED=true` 时，如果系统尚未导入任何正式待办，登录用户会看到一条明确标注为“示例”的占位提醒。阿里云成功导入第一批正式数据后，占位提醒会自动消失；正式上线后也可以将该变量改为 `false`。

## Linux 状态服务

将 `scripts/yyt-remote-state.env.example` 复制到 `/etc/yyt-remote-state.env`，填入与云托管一致的 `REMOTE_STATE_TOKEN`。

## Linux 同步任务

将 `scripts/yyt-todo-sync.env.example` 复制到 `/etc/yyt-todo-sync.env`，填写院院通 API Key、云托管地址、导入密钥和状态服务地址。

两个环境文件不得提交 GitHub，建议权限：

```bash
sudo chown root:yyt /etc/yyt-remote-state.env /etc/yyt-todo-sync.env
sudo chmod 640 /etc/yyt-remote-state.env /etc/yyt-todo-sync.env
```
