# 腾讯云托管快速上线

## 1. 部署后端服务

如果你使用「模板二次开发」生成的 GitHub 仓库和流水线，保持仓库根目录构建即可。本项目根目录已经提供：

```text
Dockerfile
container.config.json
package.json
index.js
```

根目录 `Dockerfile` 和 `index.js` 都会实际启动 `server/src/index.js`。因此无论云托管使用 Dockerfile 模式，还是 Express.js 普通 Node 构建模式，都能启动同一个后端。

如果你在云托管控制台手动新建服务，也可以把云托管服务目录选择为：

```text
server
```

并使用 `server/Dockerfile` 构建。

模板流水线默认容器端口为：

```text
80
```

如果手动使用 `server/Dockerfile` 部署，容器端口可使用：

```text
3000
```

## 2. 云托管环境变量

在云托管服务的环境变量中填写：

```env
# 模板流水线根目录 Dockerfile 使用 80；手动使用 server/Dockerfile 时可填 3000。
PORT=80
NODE_ENV=production
MOCK_MODE=false
ALLOWED_ORIGINS=*

TODO_DATA_SOURCE=api
TODO_API_BASE_URL=https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73
TODO_API_KEY=替换为院院通API_KEY
TODO_API_TIMEOUT_MS=20000

REMINDER_SCHEDULE_ENABLED=true
REMINDER_SCHEDULE_TIMES=09:00,17:00
REMINDER_TIME_ZONE=Asia/Shanghai
REMINDER_SCHEDULE_POLL_MS=60000
REMINDER_FETCH_PAGE_SIZE=100
REMINDER_SEND_ONLY_PENDING=true

WECHAT_APP_ID=替换为小程序AppID
WECHAT_APP_SECRET=替换为小程序AppSecret
WECHAT_SUBSCRIBE_TEMPLATE_ID=替换为订阅消息模板ID
WECHAT_SUBSCRIBE_TEMPLATE_PAGE=pages/index/index

APP_TOKEN_SECRET=替换为强随机字符串
```

不要把本地 `server/.env` 上传为生产密钥来源，生产密钥应放在云托管环境变量里。

## 3. 配置前端云端地址

云托管部署成功后会得到一个 HTTPS 服务域名，例如：

```text
https://xxxx.service.tcloudbase.com
```

打开：

```text
utils/constants.js
```

把 `API_BASE_URLS.cloud` 改成你的云托管域名，并把 `API_ENV` 改为：

```js
const API_ENV = 'cloud';
```

## 4. 微信公众平台配置

在微信公众平台配置：

```text
开发管理 -> 开发设置 -> 服务器域名 -> request 合法域名
```

加入云托管 HTTPS 域名。

## 5. 院院通 IP 白名单

把云托管服务访问院院通 API 的出口 IP 加入院院通白名单。

如果云托管不能提供固定出口 IP，建议使用腾讯云固定公网出口能力，或改用云服务器 CVM/NAT 网关方案。

## 6. 验证

后端健康检查：

```text
https://你的云托管域名/health
```

返回类似：

```json
{"code":0,"message":"ok","data":{"service":"neurogaze-miniprogram-server","service_name":"院院通待办提醒服务","mock_mode":false}}
```

提醒状态接口需要登录 token，可先在小程序端登录绑定后查看功能是否正常。
