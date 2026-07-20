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
  res.json({
    code: 0,
    message: 'ok',
    data: {
      service: 'neurogaze-miniprogram-server',
      service_name: '院院通待办提醒服务',
      mock_mode: config.mockMode
    }
  });
});

app.get('/health/egress-ip', async (req, res, next) => {
  if (!config.enableEgressIpCheck) {
    res.status(404).json({ code: 404, message: 'endpoint not found', data: null });
    return;
  }
  try {
    const endpoints = [
      {
        url: 'https://myip.ipip.net',
        parse: (text) => {
          const match = text.match(/\d{1,3}(?:\.\d{1,3}){3}/);
          return match && match[0];
        }
      },
      {
        url: 'https://ifconfig.me/ip',
        parse: (text) => text.trim()
      },
      {
        url: 'https://api.ipify.org?format=json',
        parse: (text) => JSON.parse(text).ip
      }
    ];
    const attempts = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, { headers: { Accept: 'text/plain, application/json' } });
        const text = await response.text();
        if (!response.ok) {
          attempts.push({ url: endpoint.url, status: response.status, body: text.slice(0, 120) });
          continue;
        }
        const ip = endpoint.parse(text);
        if (ip) {
          res.json({
            code: 0,
            message: 'ok',
            data: {
              egress_ip: ip,
              source: endpoint.url,
              checked_at: new Date().toISOString()
            }
          });
          return;
        }
        attempts.push({ url: endpoint.url, status: response.status, body: text.slice(0, 120) });
      } catch (error) {
        attempts.push({ url: endpoint.url, error: error.message });
      }
    }
    res.json({
      code: 502,
      message: 'egress ip check failed',
      data: {
        attempts,
        checked_at: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'endpoint not found', data: null });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status = error.status || 500;
  res.status(status).json({
    code: status,
    message: error.message || 'internal server error',
    data: null
  });
});

module.exports = app;
