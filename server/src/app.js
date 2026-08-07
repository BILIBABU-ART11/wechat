const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
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
      login_reasons: loginReadiness.reasons
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
