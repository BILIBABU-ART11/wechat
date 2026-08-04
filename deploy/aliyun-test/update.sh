#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${YYT_APP_DIR:-/opt/yyt-todo}"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_SOURCE="${SOURCE_DIR}/app"

if [[ ${EUID} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || { echo 'Run as root or install sudo.' >&2; exit 1; }
  exec sudo bash "$0" "$@"
fi

[[ -f "$APP_SOURCE/package.json" ]] || { echo 'Deployment package is incomplete.' >&2; exit 1; }
[[ -f "$APP_SOURCE/package-lock.json" ]] || { echo 'Deployment package lock file is missing.' >&2; exit 1; }
[[ -f /etc/yyt-remote-state.env && -f /etc/yyt-todo-sync.env ]] || {
  echo 'YYT is not installed. Run install.sh first.' >&2
  exit 1
}

install -d -m 0750 -o yyt -g yyt "$APP_DIR/scripts"
install -m 0644 "$APP_SOURCE/package.json" "$APP_DIR/package.json"
install -m 0644 "$APP_SOURCE/package-lock.json" "$APP_DIR/package-lock.json"
install -m 0755 "$APP_SOURCE/scripts/remote-state-server.js" "$APP_DIR/scripts/remote-state-server.js"
install -m 0755 "$APP_SOURCE/scripts/sync-todo-to-cloud.js" "$APP_DIR/scripts/sync-todo-to-cloud.js"
npm --prefix "$APP_DIR" ci --omit=dev --ignore-scripts --no-audit --no-fund
chown -R yyt:yyt "$APP_DIR"
systemctl restart yyt-remote-state.service
curl -fsS --retry 10 --retry-delay 1 --retry-connrefused --max-time 30 http://127.0.0.1:3100/health >/dev/null
printf '[YYT] Update completed. Existing data and environment files were preserved.\n'
