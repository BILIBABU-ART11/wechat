#!/usr/bin/env bash

set -Eeuo pipefail

EXPECTED_PUBLIC_IP="${YYT_EXPECTED_PUBLIC_IP:-120.26.231.85}"
APP_DIR="${YYT_APP_DIR:-/opt/yyt-todo}"
STATE_DIR="${YYT_STATE_DIR:-/opt/yyt-state}"
LOG_DIR="${YYT_LOG_DIR:-/var/log/yyt-todo-sync}"
STATE_ENV="/etc/yyt-remote-state.env"
SYNC_ENV="/etc/yyt-todo-sync.env"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_SOURCE="${SOURCE_DIR}/app"
SYSTEMD_SOURCE="${SOURCE_DIR}/systemd"

log() {
  printf '[YYT] %s\n' "$*"
}

fail() {
  printf '[YYT] ERROR: %s\n' "$*" >&2
  exit 1
}

on_error() {
  printf '[YYT] Installation failed at line %s.\n' "$1" >&2
  printf '[YYT] Run: sudo bash %s/diagnose.sh\n' "$SOURCE_DIR" >&2
}
trap 'on_error "$LINENO"' ERR

require_package_files() {
  local required=(
    "${APP_SOURCE}/package.json"
    "${APP_SOURCE}/package-lock.json"
    "${APP_SOURCE}/scripts/remote-state-server.js"
    "${APP_SOURCE}/scripts/sync-todo-to-cloud.js"
    "${SYSTEMD_SOURCE}/yyt-remote-state.service"
    "${SYSTEMD_SOURCE}/yyt-todo-sync.service"
    "${SYSTEMD_SOURCE}/yyt-todo-sync-morning.timer"
    "${SYSTEMD_SOURCE}/yyt-todo-sync-evening.timer"
  )
  local file
  for file in "${required[@]}"; do
    [[ -f "$file" ]] || fail "Deployment package is incomplete: $file"
  done
}

if [[ "${1:-}" == "--check" ]]; then
  require_package_files
  [[ -r /etc/os-release ]] || fail '/etc/os-release is unavailable.'
  command -v systemctl >/dev/null 2>&1 || fail 'systemd is required.'
  log "Package check passed on $(. /etc/os-release && printf '%s %s' "$ID" "${VERSION_ID:-unknown}")."
  exit 0
fi

if [[ ${EUID} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || fail 'Run this installer as root or install sudo.'
  exec sudo --preserve-env=TODO_API_KEY,YYT_EXPECTED_PUBLIC_IP,YYT_RUN_INITIAL_SYNC bash "$0" "$@"
fi

require_package_files

install_base_tools() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl ca-certificates openssl tar xz-utils
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl ca-certificates openssl tar xz
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl ca-certificates openssl tar xz
  else
    fail 'Supported package manager not found. Use Ubuntu, Debian, Alibaba Cloud Linux, CentOS, RHEL, Rocky or AlmaLinux.'
  fi
}

node_is_supported() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0')"
  [[ "$major" -ge 18 ]]
}

install_node() {
  if node_is_supported; then
    log "Using $(node --version)."
    return
  fi

  log 'Installing Node.js 20.'
  local setup_file
  setup_file="$(mktemp)"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL --retry 3 --connect-timeout 15 https://deb.nodesource.com/setup_20.x -o "$setup_file"
    bash "$setup_file"
    apt-get install -y nodejs
  else
    curl -fsSL --retry 3 --connect-timeout 15 https://rpm.nodesource.com/setup_20.x -o "$setup_file"
    bash "$setup_file"
    if command -v dnf >/dev/null 2>&1; then
      dnf install -y nodejs
    else
      yum install -y nodejs
    fi
  fi
  rm -f "$setup_file"
  node_is_supported || fail 'Node.js 18 or newer could not be installed.'
}

verify_public_ip() {
  local detected_ip
  detected_ip="$(curl -4fsS --connect-timeout 10 --max-time 20 https://api.ipify.org || true)"
  [[ -n "$detected_ip" ]] || fail 'Unable to detect the server public IPv4 address.'
  log "Detected public IPv4: $detected_ip"
  if [[ "$detected_ip" != "$EXPECTED_PUBLIC_IP" && "${YYT_ALLOW_IP_MISMATCH:-false}" != 'true' ]]; then
    fail "Expected public IPv4 $EXPECTED_PUBLIC_IP but detected $detected_ip. Set YYT_ALLOW_IP_MISMATCH=true only after checking the API whitelist."
  fi
}

read_api_key() {
  if [[ -z "${TODO_API_KEY:-}" ]]; then
    [[ -t 0 ]] || fail 'TODO_API_KEY is required in non-interactive mode.'
    read -rsp 'Enter the YYT TODO_API_KEY: ' TODO_API_KEY
    printf '\n'
  fi
  [[ "$TODO_API_KEY" =~ ^[A-Za-z0-9._~-]+$ ]] || fail 'TODO_API_KEY contains unsupported characters.'
}

create_service_user() {
  if ! id yyt >/dev/null 2>&1; then
    local nologin_shell='/usr/sbin/nologin'
    [[ -x "$nologin_shell" ]] || nologin_shell='/sbin/nologin'
    useradd --system --home-dir "$APP_DIR" --shell "$nologin_shell" yyt
  fi
}

install_application() {
  install -d -m 0750 -o yyt -g yyt "$APP_DIR" "$APP_DIR/scripts"
  install -d -m 0700 -o yyt -g yyt "$STATE_DIR" "$LOG_DIR"
  install -m 0644 "$APP_SOURCE/package.json" "$APP_DIR/package.json"
  install -m 0644 "$APP_SOURCE/package-lock.json" "$APP_DIR/package-lock.json"
  install -m 0755 "$APP_SOURCE/scripts/remote-state-server.js" "$APP_DIR/scripts/remote-state-server.js"
  install -m 0755 "$APP_SOURCE/scripts/sync-todo-to-cloud.js" "$APP_DIR/scripts/sync-todo-to-cloud.js"
  log 'Installing runtime dependencies.'
  npm --prefix "$APP_DIR" ci --omit=dev --ignore-scripts --no-audit --no-fund
  chown -R yyt:yyt "$APP_DIR"
}

write_environment_files() {
  if [[ -e "$STATE_ENV" || -e "$SYNC_ENV" ]]; then
    [[ -f "$STATE_ENV" && -f "$SYNC_ENV" ]] || fail 'Only one YYT environment file exists; fix /etc/yyt-*.env before reinstalling.'
    log 'Existing environment files preserved.'
    return
  fi

  local state_token import_token
  state_token="$(openssl rand -hex 32)"
  import_token="$(openssl rand -hex 32)"

  umask 077
  cat >"$STATE_ENV" <<EOF
REMOTE_STATE_HOST=127.0.0.1
REMOTE_STATE_PORT=3100
REMOTE_STATE_FILE=$STATE_DIR/yyt-state.json
REMOTE_STATE_TOKEN=$state_token
EOF

  cat >"$SYNC_ENV" <<EOF
TZ=Asia/Shanghai
TODO_API_BASE_URL=https://accumedical.aiforce.cloud/app/app_4jwag2n0mjq73
TODO_API_KEY=$TODO_API_KEY
REMOTE_STATE_API_BASE_URL=http://127.0.0.1:3100
REMOTE_STATE_TOKEN=$state_token
TODO_SYNC_LOG_DIR=$LOG_DIR
TODO_SYNC_REQUEST_TIMEOUT_MS=30000
TODO_SYNC_REMOTE_TIMEOUT_MS=15000
TODO_SYNC_CLOUD_TIMEOUT_MS=30000
TODO_SYNC_REQUEST_RETRIES=3
TODO_SYNC_MAX_PAGES=1000
CLOUD_TRIGGER_ENABLED=false
CLOUD_API_BASE_URL=https://express-0kx6-284420-7-1455148284.sh.run.tcloudbase.com
TODO_IMPORT_TOKEN=$import_token
TRIGGER_REMINDERS=false
EOF
  chown yyt:yyt "$STATE_ENV" "$SYNC_ENV"
  chmod 0600 "$STATE_ENV" "$SYNC_ENV"
}

render_unit() {
  local source="$1" target="$2" node_bin="$3" calendar_value="${4:-}"
  sed \
    -e "s|@APP_DIR@|$APP_DIR|g" \
    -e "s|@NODE_BIN@|$node_bin|g" \
    -e "s|@STATE_DIR@|$STATE_DIR|g" \
    -e "s|@LOG_DIR@|$LOG_DIR|g" \
    -e "s|@ON_CALENDAR@|$calendar_value|g" \
    "$source" >"$target"
  chmod 0644 "$target"
}

install_systemd_units() {
  local node_bin morning evening
  node_bin="$(command -v node)"
  morning='*-*-* 09:20:00 Asia/Shanghai'
  evening='*-*-* 17:20:00 Asia/Shanghai'
  if ! systemd-analyze calendar "$morning" >/dev/null 2>&1; then
    log 'This systemd version does not support per-timer time zones; setting the server time zone to Asia/Shanghai.'
    timedatectl set-timezone Asia/Shanghai
    morning='*-*-* 09:20:00'
    evening='*-*-* 17:20:00'
  fi

  render_unit "$SYSTEMD_SOURCE/yyt-remote-state.service" /etc/systemd/system/yyt-remote-state.service "$node_bin"
  render_unit "$SYSTEMD_SOURCE/yyt-todo-sync.service" /etc/systemd/system/yyt-todo-sync.service "$node_bin"
  render_unit "$SYSTEMD_SOURCE/yyt-todo-sync-morning.timer" /etc/systemd/system/yyt-todo-sync-morning.timer "$node_bin" "$morning"
  render_unit "$SYSTEMD_SOURCE/yyt-todo-sync-evening.timer" /etc/systemd/system/yyt-todo-sync-evening.timer "$node_bin" "$evening"

  systemctl daemon-reload
  systemctl enable --now yyt-remote-state.service
  systemctl enable --now yyt-todo-sync-morning.timer yyt-todo-sync-evening.timer
}

verify_state_service() {
  local attempt
  for attempt in {1..15}; do
    if curl -fsS --connect-timeout 2 http://127.0.0.1:3100/health >/dev/null; then
      log 'Remote JSON state service is healthy.'
      return
    fi
    sleep 1
  done
  systemctl status yyt-remote-state.service --no-pager || true
  fail 'Remote JSON state service did not become healthy.'
}

run_initial_sync() {
  if [[ "${YYT_RUN_INITIAL_SYNC:-true}" != 'true' ]]; then
    log 'Initial sync skipped by YYT_RUN_INITIAL_SYNC.'
    return
  fi
  log 'Running the first data sync. Cloud trigger and reminders are disabled.'
  if ! systemctl start yyt-todo-sync.service; then
    journalctl -u yyt-todo-sync.service -n 100 --no-pager || true
    fail 'Installation succeeded, but the first data sync failed. Check the API whitelist and logs.'
  fi
}

main() {
  log 'Starting YYT Aliyun server-test installation.'
  install_base_tools
  install_node
  command -v systemctl >/dev/null 2>&1 || fail 'systemd is required.'
  verify_public_ip
  read_api_key
  create_service_user
  install_application
  write_environment_files
  install_systemd_units
  verify_state_service
  run_initial_sync

  log 'Installation completed.'
  log "State file: $STATE_DIR/yyt-state.json"
  log "Sync logs: $LOG_DIR"
  log 'Timers: systemctl list-timers --all | grep yyt'
  log 'Diagnostics: sudo bash diagnose.sh'
  log 'Cloud trigger and WeChat reminders remain disabled until HTTPS is configured.'
}

main "$@"
