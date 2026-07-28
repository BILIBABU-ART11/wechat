#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_TODO_BASE_URL = 'https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73';
const DEFAULT_CLOUD_BASE_URL = 'https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com';

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
  return value;
}

function buildTodoUrl(baseUrl, page, pageSize, snapshotDate) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/openapi/todo-stat/snapshots`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  if (snapshotDate) url.searchParams.set('snapshotDate', snapshotDate);
  return url;
}

async function fetchJson(url, options, label) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`${label} returned non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const message = payload && (payload.error_msg || payload.message || (payload.error && payload.error.message));
    throw new Error(`${label} failed: HTTP ${response.status}${message ? ` ${message}` : ''}`);
  }
  return payload;
}

async function fetchAllTodoSnapshots(config) {
  const allItems = [];
  let page = 1;
  let total = 0;
  do {
    const url = buildTodoUrl(config.todoBaseUrl, page, config.pageSize, config.snapshotDate);
    console.log(`[todo-sync] fetching page ${page}: ${url}`);
    const payload = await fetchJson(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.todoApiKey}`
      }
    }, 'Todo API');

    if (!Array.isArray(payload.items)) {
      throw new Error('Todo API response missing items array.');
    }
    allItems.push(...payload.items);
    total = Number(payload.total || allItems.length);
    page += 1;
  } while (allItems.length < total);

  return { items: allItems, total };
}

async function importToCloud(config, todoResult, startedAt) {
  const importUrl = `${config.cloudBaseUrl.replace(/\/+$/, '')}/api/todo-stat/import`;
  const payload = {
    meta: {
      source: 'todo-stat-snapshots',
      todoBaseUrl: config.todoBaseUrl,
      snapshotDate: config.snapshotDate,
      startedAt,
      fetchedAt: new Date().toISOString(),
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

  console.log(`[todo-sync] importing ${todoResult.items.length} records to ${importUrl}`);
  const result = await fetchJson(importUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
      Authorization: `Bearer ${config.importToken}`
    },
    body: JSON.stringify(payload)
  }, 'Cloud import API');

  return { payload, result };
}

function writeLog(config, data) {
  fs.mkdirSync(config.logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const logPath = path.join(config.logDir, `todo-sync-${timestamp}.json`);
  fs.writeFileSync(logPath, JSON.stringify(data, null, 2), 'utf8');
  return logPath;
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const config = {
    todoBaseUrl: readArg('todo-base-url', process.env.TODO_API_BASE_URL || DEFAULT_TODO_BASE_URL),
    todoApiKey: readArg('todo-api-key', process.env.TODO_API_KEY),
    cloudBaseUrl: readArg('cloud-base-url', process.env.CLOUD_API_BASE_URL || DEFAULT_CLOUD_BASE_URL),
    importToken: readArg('import-token', process.env.TODO_IMPORT_TOKEN),
    snapshotDate: readArg('snapshot-date', process.env.SNAPSHOT_DATE || ''),
    pageSize: Math.min(100, Math.max(1, Number(readArg('page-size', process.env.PAGE_SIZE || 100)))),
    triggerReminders: readBool(readArg('trigger-reminders', process.env.TRIGGER_REMINDERS), true),
    logDir: readArg('log-dir', process.env.TODO_SYNC_LOG_DIR || path.join(projectRoot, 'todo-sync-logs'))
  };

  requireValue(config.todoApiKey, 'todo-api-key');
  requireValue(config.cloudBaseUrl, 'cloud-base-url');
  requireValue(config.importToken, 'import-token');

  const startedAt = new Date().toISOString();
  const todoResult = await fetchAllTodoSnapshots(config);
  const importResult = await importToCloud(config, todoResult, startedAt);
  const logPath = writeLog(config, {
    startedAt,
    finishedAt: new Date().toISOString(),
    todo: {
      total: todoResult.total,
      itemCount: todoResult.items.length
    },
    cloud: importResult.result
  });

  console.log('[todo-sync] completed');
  console.log(JSON.stringify({
    fetched: todoResult.items.length,
    total: todoResult.total,
    cloud: importResult.result,
    logPath
  }, null, 2));
}

main().catch((error) => {
  console.error(`[todo-sync] failed: ${error.message}`);
  process.exit(1);
});
