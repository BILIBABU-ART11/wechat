# 开发与验证

## 本地测试

```powershell
$env:Path="C:\Users\Zhengquanbu\tools\nodejs;$env:Path"
npm run preflight
npm test
```

微信开发者工具导入项目根目录。仓库 AppID 为 `wx964c3e4ac820ac37`，后端 `WECHAT_APP_ID` 必须相同。

## 正式模式

```text
MOCK_MODE=false
TODO_DATA_SOURCE=import
STORAGE_MODE=remote-json
REMINDER_SCHEDULE_ENABLED=false
```

云托管不直接请求院院通 API，也不运行内部定时器。Linux systemd timer 在北京时间 09:20、17:20 执行同步脚本。

## 开发约束

- 小程序只能通过云托管 API 读取数据，不能直接访问 Linux 状态服务。
- Access Token 不保存 openid 或院院通 ID。
- 用户查询始终由后端覆盖 userId，禁止跨用户读取。
- 完整待办只写 Linux 状态服务；云托管导入接口只接收 batch_id。
- 微信订阅模板字段必须由环境变量配置。
- 普通用户不能调用提醒运行接口。

## 验收

- 两个微信用户绑定不同 ID 时数据完全隔离。
- 重复 batch_id 不重复发送。
- 一个模板授权最多消费一次。
- 主 JSON 损坏后从 `.bak` 恢复。
- Linux 服务器保持 UTC 时，timer 仍在北京时间 09:20 和 17:20 运行。
