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
