#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"
LOG_DIR="${TODO_SYNC_LOG_DIR:-$PROJECT_DIR/todo-sync-logs}"
CRON_FILE="${CRON_FILE:-$PROJECT_DIR/todo-sync.cron}"

mkdir -p "$LOG_DIR"

cat > "$CRON_FILE" <<EOF
SHELL=/bin/sh
TODO_API_KEY=${TODO_API_KEY:-}
CLOUD_API_BASE_URL=${CLOUD_API_BASE_URL:-https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com}
TODO_IMPORT_TOKEN=${TODO_IMPORT_TOKEN:-}
TODO_SYNC_LOG_DIR=$LOG_DIR

20 9 * * * cd "$PROJECT_DIR" && "$NODE_BIN" scripts/sync-todo-to-cloud.js >> "$LOG_DIR/cron-0920.log" 2>&1
20 17 * * * cd "$PROJECT_DIR" && "$NODE_BIN" scripts/sync-todo-to-cloud.js >> "$LOG_DIR/cron-1720.log" 2>&1
EOF

echo "Cron file written: $CRON_FILE"
echo "Review it, then install with:"
echo "crontab $CRON_FILE"
