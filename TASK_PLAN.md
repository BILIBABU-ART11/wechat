# Project README Documentation

- [x] Audit the implemented architecture, runtime configuration, APIs, and deployment scripts.
- [x] Rewrite the root README in Chinese without embedding production secrets.
- [x] Document development, Tencent CloudRun, Aliyun synchronization, release, and troubleshooting workflows.
- [x] Validate all documented paths, commands, environment variables, and links against the repository.
- [x] Re-run the README validator with shell-safe Markdown fence detection after a PowerShell quoting failure.
- [x] Run documentation checks and mark the documentation task complete.
- [x] Retry the GitHub push after a transient connection reset.

# Mini Program CloudRun Access

- [x] Add request tests for the CloudRun environment, service, path, and login token.
- [x] Initialize `wx.cloud` with `prod-d5g6lfndn063b2d5d` during application launch.
- [x] Route frontend backend calls through `wx.cloud.callContainer` instead of `wx.request`.
- [x] Pass frontend, backend, and deployment preflight regression checks.
- [x] Commit and push the verified change to GitHub `master`.

# 微信登录云端修复

- [x] 配置并验证本地后端微信凭证；验收标准：`wechatLoginReadiness()` 返回 `login_ready=true`，且凭证文件不被 Git 跟踪。
- [x] 生成并配置云端 `TODO_IMPORT_TOKEN`；验收标准：本地后端可读取 64 位随机令牌，线上健康检查不再报告该变量缺失。
- [ ] 将 `TODO_IMPORT_TOKEN` 同步到 Linux 同步任务；验收标准：Linux 与云托管使用同一值，并能通过导入接口鉴权。
- [x] 核对微信订阅消息模板；验收标准：通过微信官方接口确认模板 ID 及 `time11`、`thing1` 字段，不使用未经核对的占位值。
- [x] 在腾讯云托管后端配置真实 `WECHAT_APP_SECRET`；验收标准：密钥仅存在于云端环境变量，不进入前端或 Git 跟踪文件。
- [x] 发布当前登录修复代码；验收标准：线上 `/health` 包含 `login_ready` 字段，登录配置错误不再返回模糊 500。
- [x] 诊断腾讯云访问微信 API 的网络失败；验收标准：确认微信云托管将域名解析到 `169.254.10.1` 内部代理，并返回自签名证书。
- [x] 接入微信云托管开放接口服务；验收标准：云端使用 HTTP 私有链路访问微信 API，本地继续使用 HTTPS，登录不再出现证书错误。
- [x] 验证线上微信登录链路；验收标准：诊断请求已由微信 `code2Session` 返回 `40029`，不再报告配置或证书错误。
- [x] 运行本地测试与部署预检；验收标准：测试、结构校验和 AppID 预检全部通过。

# 待办示例数据

- [x] 为导入数据空状态增加示例回退测试；验收标准：仅当全局尚无正式导入数据时，当前登录账号获得一条明确标注为示例的提醒。
- [x] 实现示例提醒回退及配置开关；验收标准：`TODO_SAMPLE_FALLBACK_ENABLED=true` 时可展示占位数据，正式数据到达后自动停用。
- [x] 更新部署环境变量说明；验收标准：文档说明当前启用方式以及阿里云正式同步后可关闭的变量。
- [x] 运行完整测试并发布；验收标准：所有后端测试通过，代码推送后可由云托管自动部署。

# 登录 500 修复

- [x] 增加真实微信登录模式下缺少 AppID/AppSecret 的失败测试；验收标准：接口不再返回模糊 500，而是返回可识别的登录配置错误。
- [x] 优化后端登录配置检查和错误响应；验收标准：`/api/auth/wechat-login` 返回稳定 `error_code`，`/health` 可看到登录配置状态。
- [x] 优化小程序端请求错误解析和登录页提示；验收标准：登录页能区分后端配置缺失、微信接口失败和网络失败。
- [x] 运行后端测试；验收标准：新增测试和现有冒烟测试通过。

# 阿里云服务器测试部署包

- [x] 检查现有同步与部署结构。
- [x] 为无域名测试模式增加失败优先测试。
- [x] 实现 CLOUD_TRIGGER_ENABLED 开关。
- [x] 制作阿里云一键安装、更新、卸载和诊断脚本。
- [x] 生成可直接上传的 tar.gz 压缩包。
- [x] 完成自动测试、Linux 脚本格式检查和压缩包校验。
- [ ] 提交并推送 GitHub。
