#!/usr/bin/env node

const crypto = require('crypto');
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
  if (!value) throw new Error(`Missing ${name}. Set it as an environment variable or pass --${name}=...`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampForFile(value) {
  return String(value || nowIso()).replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

function createLogger(logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  const textLogPath = path.join(logDir, `todo-sync-${timestampForFile()}.log`);
  const latestTextLogPath = path.join(logDir, 'todo-sync-latest.log');
  const events = [];

  function write(level, message, data) {
    const event = { time: nowIso(), level, message, data: data || null };
    events.push(event);
    const line = `[${event.time}] [${level.toUpperCase()}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`;
    fs.appendFileSync(textLogPath, `${line}\n`, 'utf8');
    fs.appendFileSync(latestTextLogPath, `${line}\n`, 'utf8');
    if (level === 'error') console.error(line);
    else console.log(line);
  }

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
    reminder_result: payload.data && payload.data.reminder_result
  };
}

async function fetchJson(url, options, label, logger, settings) {
  const retries = Math.max(0, Number(settings.retries || 0));
  const timeoutMs = Math.max(1000, Number(settings.timeoutMs || 30000));
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      logger.info(`${label} request started`, {
        method: options.method || 'GET',
        url: String(url),
        attempt: attempt + 1,
        timeoutMs
      });
      const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (error) {
        throw new Error(`${label} returned non-JSON response: ${text.slice(0, 200)}`);
      }
      logger.info(`${label} response received`, {
        status: response.status,
        ok: response.ok,
        elapsedMs: Date.now() - started,
        summary: summarizePayload(payload)
      });
      if (!response.ok) {
        const message = payload && (payload.error_msg || payload.message || (payload.error && payload.error.message));
        const error = new Error(`${label} failed: HTTP ${response.status}${message ? ` ${message}` : ''}`);
        error.retryable = response.status >= 500 || response.status === 429;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error.name === 'AbortError' ? new Error(`${label} timed out after ${timeoutMs}ms`) : error;
      const canRetry = attempt < retries && (lastError.retryable !== false);
      logger[canRetry ? 'warn' : 'error'](`${label} request failed`, {
        attempt: attempt + 1,
        elapsedMs: Date.now() - started,
        retrying: canRetry,
        message: lastError.message
      });
      if (!canRetry) throw lastError;
      await sleep(Math.min(1000 * (2 ** attempt), 8000));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function buildTodoUrl(baseUrl, page, pageSize, snapshotDate) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/openapi/todo-stat/snapshots`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  if (snapshotDate) url.searchParams.set('snapshotDate', snapshotDate);
  return url;
}

async function fetchAllTodoSnapshots(config, logger) {
  const itemsById = new Map();
  let expectedTotal = null;
  let page = 1;

  while (page <= config.maxPages) {
    const payload = await fetchJson(buildTodoUrl(
      config.todoBaseUrl,
      page,
      config.pageSize,
      config.snapshotDate
    ), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.todoApiKey}`
      }
    }, 'Todo API', logger, {
      timeoutMs: config.todoTimeoutMs,
      retries: config.requestRetries
    });

    if (!Array.isArray(payload.items)) throw new Error('Todo API response missing items array.');
    if (expectedTotal === null && payload.total !== undefined) {
      expectedTotal = Math.max(0, Number(payload.total || 0));
      if (!Number.isFinite(expectedTotal)) throw new Error('Todo API returned an invalid total.');
    }
    if (!payload.items.length) {
      if (expectedTotal !== null && itemsById.size < expectedTotal) {
        logger.warn('Todo API returned an empty page before the reported total was reached', {
          page,
          collected: itemsById.size,
          expectedTotal
        });
      }
      break;
    }

    const before = itemsById.size;
    payload.items.forEach((item) => {
      const id = String(item && item.id || '');
      if (id) itemsById.set(id, item);
    });
    const added = itemsById.size - before;
    logger.info('Todo page processed', {
      page,
      received: payload.items.length,
      added,
      collected: itemsById.size,
      expectedTotal
    });
    if (added === 0) throw new Error(`Todo pagination made no progress on page ${page}.`);
    if (expectedTotal !== null && itemsById.size >= expectedTotal) break;
    page += 1;
  }

  if (page > config.maxPages) {
    throw new Error(`Todo pagination exceeded TODO_SYNC_MAX_PAGES=${config.maxPages}.`);
  }
  const items = [...itemsById.values()];
  return { items, total: expectedTotal === null ? items.length : expectedTotal };
}

function createBatchId(items, startedAt) {
  const stableItems = items.slice().sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  const digest = crypto.createHash('sha256').update(JSON.stringify(stableItems)).digest('hex').slice(0, 16);
  return `${timestampForFile(startedAt)}-${digest}`;
}

async function syncToRemoteState(config, todoResult, startedAt, batchId, logger) {
  const stateUrl = `${config.remoteStateBaseUrl.replace(/\/+$/, '')}/todo/snapshots`;
  return fetchJson(stateUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${config.remoteStateToken}`
    },
    body: JSON.stringify({
      batch_id: batchId,
      imported_at: nowIso(),
      meta: {
        source: 'todo-stat-snapshots',
        startedAt,
        total: todoResult.total,
        itemCount: todoResult.items.length
      },
      data: { items: todoResult.items }
    })
  }, 'Remote state API', logger, {
    timeoutMs: config.remoteTimeoutMs,
    retries: config.requestRetries
  });
}

async function triggerCloudImport(config, batchId, logger) {
  const importUrl = `${config.cloudBaseUrl.replace(/\/+$/, '')}/api/todo-stat/import`;
  return fetchJson(importUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${config.importToken}`
    },
    body: JSON.stringify({
      batch_id: batchId,
      trigger_reminders: config.triggerReminders
    })
  }, 'Cloud import API', logger, {
    timeoutMs: config.cloudTimeoutMs,
    retries: config.requestRetries
  });
}

function atomicWriteJson(file, payload) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(temp, file);
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
  atomicWriteJson(logPath, payload);
  atomicWriteJson(latestPath, payload);
  return logPath;
}

async function waitForRemoteBatch(config, batchId, logger) {
  const attempts = 30;
  const intervalMs = 1000;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchJson(`${config.remoteStateBaseUrl}/imports/${encodeURIComponent(batchId)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.remoteStateToken}`
      }
    }, 'Remote batch status', logger, {
      timeoutMs: config.remoteTimeoutMs,
      retries: config.requestRetries
    });
    const batch = response && response.data;
    if (batch && batch.status === 'success') return batch;
    if (batch && batch.status === 'failed') {
      throw new Error(`Cloud reminder batch failed: ${batch.error_message || batchId}`);
    }
    if (attempt < attempts) await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for cloud reminder batch: ${batchId}`);
}

function readConfig(projectRoot) {
  const requestTimeout = Number(readArg('request-timeout-ms', process.env.TODO_SYNC_REQUEST_TIMEOUT_MS || 30000));
  return {
    todoBaseUrl: readArg('todo-base-url', process.env.TODO_API_BASE_URL || DEFAULT_TODO_BASE_URL),
    todoApiKey: readArg('todo-api-key', process.env.TODO_API_KEY),
    cloudBaseUrl: readArg('cloud-base-url', process.env.CLOUD_API_BASE_URL || DEFAULT_CLOUD_BASE_URL),
    importToken: readArg('import-token', process.env.TODO_IMPORT_TOKEN),
    remoteStateBaseUrl: readArg('remote-state-base-url', process.env.REMOTE_STATE_API_BASE_URL || ''),
    remoteStateToken: readArg('remote-state-token', process.env.REMOTE_STATE_TOKEN || ''),
    snapshotDate: readArg('snapshot-date', process.env.SNAPSHOT_DATE || ''),
    pageSize: Math.min(100, Math.max(1, Number(readArg('page-size', process.env.PAGE_SIZE || 100)))),
    maxPages: Math.max(1, Number(readArg('max-pages', process.env.TODO_SYNC_MAX_PAGES || 1000))),
    requestRetries: Math.min(5, Math.max(0, Number(readArg('request-retries', process.env.TODO_SYNC_REQUEST_RETRIES || 3)))),
    todoTimeoutMs: Number(process.env.TODO_SYNC_TODO_TIMEOUT_MS || requestTimeout),
    remoteTimeoutMs: Number(process.env.TODO_SYNC_REMOTE_TIMEOUT_MS || 15000),
    cloudTimeoutMs: Number(process.env.TODO_SYNC_CLOUD_TIMEOUT_MS || requestTimeout),
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
    requireValue(config.todoApiKey, 'todo-api-key');
    requireValue(config.cloudBaseUrl, 'cloud-base-url');
    requireValue(config.importToken, 'import-token');
    requireValue(config.remoteStateBaseUrl, 'remote-state-base-url');
    requireValue(config.remoteStateToken, 'remote-state-token');

    logger.info('Todo sync job started', {
      node: process.version,
      todoBaseUrl: config.todoBaseUrl,
      cloudBaseUrl: config.cloudBaseUrl,
      remoteStateBaseUrl: config.remoteStateBaseUrl,
      pageSize: config.pageSize,
      maxPages: config.maxPages,
      requestRetries: config.requestRetries,
      hasTodoApiKey: true,
      hasImportToken: true,
      hasRemoteStateToken: true
    });

    const todoResult = await fetchAllTodoSnapshots(config, logger);
    const batchId = createBatchId(todoResult.items, startedAt);
    const remoteResult = await syncToRemoteState(config, todoResult, startedAt, batchId, logger);
    const cloudResult = await triggerCloudImport(config, batchId, logger);
    const reminderResult = cloudResult && cloudResult.data && cloudResult.data.reminder_result;
    if (reminderResult && reminderResult.skipped && reminderResult.batch && reminderResult.batch.status === 'processing') {
      await waitForRemoteBatch(config, batchId, logger);
    }
    const finishedAt = nowIso();
    const jsonLogPath = writeJsonLog(config, logger, {
      batchId,
      startedAt,
      finishedAt,
      elapsedMs: new Date(finishedAt) - new Date(startedAt),
      status: 'success',
      todo: { total: todoResult.total, itemCount: todoResult.items.length },
      remoteState: remoteResult,
      cloud: cloudResult
    });
    logger.info('Todo sync job completed', {
      batchId,
      fetched: todoResult.items.length,
      jsonLogPath
    });
  } catch (error) {
    const finishedAt = nowIso();
    logger.error('Todo sync job failed', { message: error.message, stack: error.stack });
    writeJsonLog(config, logger, {
      startedAt,
      finishedAt,
      elapsedMs: new Date(finishedAt) - new Date(startedAt),
      status: 'failed',
      error: { message: error.message, stack: error.stack }
    });
    process.exitCode = 1;
  }
}

if (require.main === module) run();

module.exports = {
  buildTodoUrl,
  fetchJson,
  fetchAllTodoSnapshots,
  createBatchId,
  waitForRemoteBatch,
  readConfig,
  run
};
