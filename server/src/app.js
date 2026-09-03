const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dns = require('dns').promises;
const tls = require('tls');
const config = require('./config');
const routes = require('./routes');

const app = express();
app.set('etag', false);
app.use(cors({
  origin: config.allowedOrigins === '*' ? true : config.allowedOrigins.split(',').map((item) => item.trim())
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.mockMode ? 'dev' : 'combined'));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/health', (req, res) => {
  const readiness = config.readiness();
  const loginReadiness = config.wechatLoginReadiness();
  res.status(readiness.ready ? 200 : 503).json({
    code: readiness.ready ? 0 : 503,
    message: readiness.ready ? 'ok' : 'service not ready',
    data: {
      service: 'yuanyuantong-todo-reminder',
      service_name: '院院通待办提醒服务',
      mock_mode: config.mockMode,
      ready: readiness.ready,
      reasons: readiness.reasons,
      login_ready: loginReadiness.ready,
      login_reasons: loginReadiness.reasons,
      runtime: {
        storage_mode: config.storage.mode || (config.mysql.host ? 'mysql' : 'memory'),
        todo_data_source: config.todoApi.dataSource,
        remote_state_configured: config.storage.mode === 'remote-json'
          && Boolean(config.remoteState.baseUrl && config.remoteState.token),
        reminder_schedule_enabled: config.reminderSchedule.enabled,
        subscription_template_configured: Boolean(config.wechat.subscribeTemplateId || config.subscribeTemplateIds.length)
      }
    }
  });
});

app.get('/health/egress-ip', async (req, res) => {
  if (!config.enableEgressIpCheck) {
    res.status(404).json({ code: 404, message: 'endpoint not found', data: null });
    return;
  }
  const endpoints = [
    ['https://myip.ipip.net', (text) => (text.match(/\d{1,3}(?:\.\d{1,3}){3}/) || [])[0]],
    ['https://ifconfig.me/ip', (text) => text.trim()],
    ['https://api.ipify.org?format=json', (text) => JSON.parse(text).ip]
  ];
  const attempts = [];
  for (const [url, parse] of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/plain, application/json' },
        signal: controller.signal
      });
      const text = await response.text();
      if (response.ok) {
        const ip = parse(text);
        if (ip) {
          res.json({
            code: 0,
            message: 'ok',
            data: { egress_ip: ip, source: url, checked_at: new Date().toISOString() }
          });
          return;
        }
      }
      attempts.push({ url, status: response.status });
    } catch (error) {
      attempts.push({ url, error: error.message });
    } finally {
      clearTimeout(timeout);
    }
  }
  res.status(502).json({
    code: 502,
    message: 'egress ip check failed',
    data: { attempts, checked_at: new Date().toISOString() }
  });
});

app.get('/health/wechat-tls', async (req, res) => {
  if (!config.enableEgressIpCheck) {
    res.status(404).json({ code: 404, message: 'endpoint not found', data: null });
    return;
  }
  try {
    const addresses = await dns.lookup('api.weixin.qq.com', { all: true });
    const result = await new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: 'api.weixin.qq.com',
        port: 443,
        servername: 'api.weixin.qq.com',
        rejectUnauthorized: false,
        timeout: 5000
      });
      socket.once('secureConnect', () => {
        const certificate = socket.getPeerCertificate();
        resolve({
          authorized: socket.authorized,
          authorization_error: socket.authorizationError || null,
          protocol: socket.getProtocol(),
          remote_address: socket.remoteAddress,
          certificate: {
            subject_cn: certificate.subject && certificate.subject.CN,
            issuer_cn: certificate.issuer && certificate.issuer.CN,
            valid_from: certificate.valid_from,
            valid_to: certificate.valid_to,
            fingerprint256: certificate.fingerprint256
          }
        });
        socket.end();
      });
      socket.once('timeout', () => socket.destroy(new Error('TLS probe timed out')));
      socket.once('error', reject);
    });
    res.json({
      code: 0,
      message: 'ok',
      data: Object.assign({
        host: 'api.weixin.qq.com',
        addresses: addresses.map((item) => ({ address: item.address, family: item.family }))
      }, result)
    });
  } catch (error) {
    res.status(502).json({
      code: 502,
      message: 'WeChat TLS probe failed',
      data: { network_code: (error && error.code) || null }
    });
  }
});

app.use('/api', routes);
app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'endpoint not found', data: null });
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  const body = {
    code: status,
    message: error.message || 'internal server error',
    data: error.details || null
  };
  if (error.errorCode) body.error_code = error.errorCode;
  res.status(status).json(body);
});

module.exports = app;
