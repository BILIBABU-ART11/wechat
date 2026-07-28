#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_TODO_BASE_URL = 'https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73';
const DEFAULT_CLOUD_BASE_URL = 'https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com';

function nowIso() {
  return new Date().toISOString();
}

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function readBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() !== 'false';
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`Missing ${name}. Set it as an environment variable or pass --${name}=...`);
  }
}

function buildTodoUrl(baseUrl, page, pageSize, snapshotDate) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/openapi/todo-stat/snapshots`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  if (snapshotDate) url.searchParams.set('snapshotDate', snapshotDate);
  return url;
}

function timestampForFile() {
  return nowIso().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

function createLogger(logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  const textLogPath = path.join(logDir, `todo-sync-${timestampForFile()}.log`);
  const latestTextLogPath = path.join(logDir, 'todo-sync-latest.log');
  const events = [];

  function write(level, message, data) {
    const event = {
      time: nowIso(),
      level,
      message,
      data: data || null
    };
    events.push(event);
    const suffix = data ? ` ${JSON.stringify(data)}` : '';
    const line = `[${event.time}] [${level.toUpperCase()}] ${message}${suffix}`;
    fs.appendFileSync(textLogPath, `${line}\n`, 'utf8');
    fs.appendFileSync(latestTextLogPath, `${line}\n`, 'utf8');
    if (level === 'error') console.error(line);
    else console.log(line);
  }

  fs.rmSync(latestTextLogPath, { force: true });
  fs.writeFileSync(latestTextLogPath, '', 'utf8');
  return {
    textLogPath,
    latestTextLogPath,
    events,
    info: (message, data) => write('info', message, data),
    warn: (message, data) => write('warn', message, data),
    error: (message, data) => write('error', message, data)
  };
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return {
    code: payload.code,
    message: payload.message,
    total: payload.total,
    page: payload.page,
    pageSize: payload.pageSize,
    itemCount: Array.isArray(payload.items) ? payload.items.length : undefined,
    imported: payload.data && payload.data.imported,
    reminder_result: payload.data && payload.data.reminder_result ? {
      skipped: payload.data.reminder_result.skipped,
      fetched_count: payload.data.reminder_result.fetched_count,
      pending_count: payload.data.reminder_result.pending_count,
      message_count: payload.data.reminder_result.message_count,
      recipient_count: payload.data.reminder_result.recipient_count,
      sent_count: payload.data.reminder_result.sent_count,
      skipped_send_count: payload.data.reminder_result.skipped_send_count
    } : undefined
  };
}

async function fetchJson(url, options, label, logger) {
  const started = Date.now();
  logger.info(`${label} request started`, {
    method: options.method || 'GET',
    url: String(url)
  });

  const response = await fetch(url, options);
  const text = await response.text();
  const elapsedMs = Date.now() - started;
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    logger.error(`${label} returned non-JSON response`, {
      status: response.status,
      elapsedMs,
      bodyPreview: text.slice(0, 300)
    });
    throw new Error(`${label} returned non-JSON response: ${text.slice(0, 200)}`);
  }

  logger.info(`${label} response received`, {
    status: response.status,
    ok: response.ok,
    elapsedMs,
    summary: summarizePayload(payload)
  });

  if (!response.ok) {
    const message = payload && (payload.error_msg || payload.message || (payload.error && payload.error.message));
    throw new Error(`${label} failed: HTTP ${response.status}${message ? ` ${message}` : ''}`);
  }
  return payload;
}

async function fetchAllTodoSnapshots(config, logger) {
  const allItems = [];
  let page = 1;
  let total = 0;
  const started = Date.now();

  do {
    const url = buildTodoUrl(config.todoBaseUrl, page, config.pageSize, config.snapshotDate);
    logger.info('Fetching todo page', {
      page,
      pageSize: config.pageSize,
      snapshotDate: config.snapshotDate || null
    });

    const payload = await fetchJson(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.todoApiKey}`
      }
    }, 'Todo API', logger);

    if (!Array.isArray(payload.items)) {
      throw new Error('Todo API response missing items array.');
    }

    allItems.push(...payload.items);
    total = Number(payload.total || allItems.length);
    logger.info('Todo page processed', {
      page,
      received: payload.items.length,
      accumulated: allItems.length,
      total
    });
    page += 1;
  } while (allItems.length < total);

  logger.info('Todo fetch completed', {
    pages: page - 1,
    itemCount: allItems.length,
    total,
    elapsedMs: Date.now() - started
  });
  return { items: allItems, total };
}

async function importToCloud(config, todoResult, startedAt, logger) {
  const importUrl = `${config.cloudBaseUrl.replace(/\/+$/, '')}/api/todo-stat/import`;
  const payload = {
    meta: {
      source: 'todo-stat-snapshots',
      todoBaseUrl: config.todoBaseUrl,
      snapshotDate: config.snapshotDate,
      startedAt,
      fetchedAt: nowIso(),
      pageSize: config.pageSize,
      total: todoResult.total,
      itemCount: todoResult.items.length
    },
    data: {
      items: todoResult.items,
      total: todoResult.total,
      page: 1,
      pageSize: config.pageSize
    },
    trigger_reminders: config.triggerReminders
  };

  logger.info('Cloud import started', {
    url: importUrl,
    itemCount: todoResult.items.length,
    triggerReminders: config.triggerReminders
  });

  const result = await fetchJson(importUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${config.importToken}`
    },
    body: JSON.stringify(payload)
  }, 'Cloud import API', logger);

  logger.info('Cloud import completed', {
    summary: summarizePayload(result)
  });
  return { payload, result };
}

function writeJsonLog(config, logger, data) {
  fs.mkdirSync(config.logDir, { recursive: true });
  const logPath = path.join(config.logDir, `todo-sync-${timestampForFile()}.json`);
  const latestPath = path.join(config.logDir, 'todo-sync-latest.json');
  const payload = Object.assign({}, data, {
    textLogPath: logger.textLogPath,
    latestTextLogPath: logger.latestTextLogPath,
    events: logger.events
  });
  const text = JSON.stringify(payload, null, 2);
  fs.writeFileSync(logPath, text, 'utf8');
  fs.rmSync(latestPath, { force: true });
  fs.writeFileSync(latestPath, text, 'utf8');
  return logPath;
}

function readConfig(projectRoot) {
  return {
    todoBaseUrl: readArg('todo-base-url', process.env.TODO_API_BASE_URL || DEFAULT_TODO_BASE_URL),
    todoApiKey: readArg('todo-api-key', process.env.TODO_API_KEY),
    cloudBaseUrl: readArg('cloud-base-url', process.env.CLOUD_API_BASE_URL || DEFAULT_CLOUD_BASE_URL),
    importToken: readArg('import-token', process.env.TODO_IMPORT_TOKEN),
    snapshotDate: readArg('snapshot-date', process.env.SNAPSHOT_DATE || ''),
    pageSize: Math.min(100, Math.max(1, Number(readArg('page-size', process.env.PAGE_SIZE || 100)))),
    triggerReminders: readBool(readArg('trigger-reminders', process.env.TRIGGER_REMINDERS), true),
    logDir: readArg('log-dir', process.env.TODO_SYNC_LOG_DIR || path.join(projectRoot, 'todo-sync-logs'))
  };
}

async function run() {
  const projectRoot = path.resolve(__dirname, '..');
  const config = readConfig(projectRoot);
  const logger = createLogger(config.logDir);
  const startedAt = nowIso();

  try {
    logger.info('Todo sync job started', {
      node: process.version,
      platform: process.platform,
      pid: process.pid,
      cwd: process.cwd(),
      todoBaseUrl: config.todoBaseUrl,
      cloudBaseUrl: config.cloudBaseUrl,
      snapshotDate: config.snapshotDate || null,
      pageSize: config.pageSize,
      triggerReminders: config.triggerReminders,
      hasTodoApiKey: Boolean(config.todoApiKey),
      hasImportToken: Boolean(config.importToken),
      logDir: config.logDir
    });

    requireValue(config.todoApiKey, 'todo-api-key');
    requireValue(config.cloudBaseUrl, 'cloud-base-url');
    requireValue(config.importToken, 'import-token');

    const todoResult = await fetchAllTodoSnapshots(config, logger);
    const importResult = await importToCloud(config, todoResult, startedAt, logger);
    const finishedAt = nowIso();
    const jsonLogPath = writeJsonLog(config, logger, {
      startedAt,
      finishedAt,
      elapsedMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      status: 'success',
      todo: {
        total: todoResult.total,
        itemCount: todoResult.items.length
      },
      cloud: importResult.result
    });

    logger.info('Todo sync job completed', {
      fetched: todoResult.items.length,
      total: todoResult.total,
      jsonLogPath,
      textLogPath: logger.textLogPath
    });

    console.log(JSON.stringify({
      ok: true,
      fetched: todoResult.items.length,
      total: todoResult.total,
      cloud: importResult.result,
      jsonLogPath,
      textLogPath: logger.textLogPath
    }, null, 2));
  } catch (error) {
    const finishedAt = nowIso();
    logger.error('Todo sync job failed', {
      message: error.message,
      stack: error.stack
    });
    const jsonLogPath = writeJsonLog(config, logger, {
      startedAt,
      finishedAt,
      elapsedMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      status: 'failed',
      error: {
        message: error.message,
        stack: error.stack
      }
    });
    logger.error('Failure log written', {
      jsonLogPath,
      textLogPath: logger.textLogPath
    });
    process.exit(1);
  }
}

run();
