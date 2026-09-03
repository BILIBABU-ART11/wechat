#!/usr/bin/env bash

set -Eeuo pipefail

STATE_ENV="${YYT_STATE_ENV:-/etc/yyt-remote-state.env}"
SYNC_ENV="${YYT_SYNC_ENV:-/etc/yyt-todo-sync.env}"
PUBLIC_IP="${YYT_EXPECTED_PUBLIC_IP:-120.26.231.85}"
RUN_NOW=false

usage() {
  cat <<'EOF'
Usage: sudo bash enable-cloud-http.sh [--public-ip IPv4] [--run-now]

Enables temporary public-IP HTTP integration between Tencent CloudRun and the
Aliyun JSON state service. This mode is intended only for controlled testing.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-ip)
      [[ $# -ge 2 ]] || { echo 'Missing value for --public-ip.' >&2; exit 2; }
      PUBLIC_IP="$2"
      shift 2
      ;;
    --run-now)
      RUN_NOW=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ${EUID} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || { echo 'Run as root or install sudo.' >&2; exit 1; }
  sudo_args=(--public-ip "$PUBLIC_IP")
  [[ "$RUN_NOW" == true ]] && sudo_args+=(--run-now)
  exec sudo bash "$0" "${sudo_args[@]}"
fi

[[ "$PUBLIC_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo 'Invalid public IPv4 address.' >&2; exit 2; }
[[ -f "$STATE_ENV" ]] || { echo "Missing $STATE_ENV. Run install.sh first." >&2; exit 1; }
[[ -f "$SYNC_ENV" ]] || { echo "Missing $SYNC_ENV. Run install.sh first." >&2; exit 1; }

read_env() {
  local file="$1" key="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

set_env() {
  local file="$1" key="$2" value="$3" temp
  temp="${file}.tmp.$$"
  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    index($0, key "=") == 1 {
      if (!replaced) print key "=" value
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) print key "=" value }
  ' "$file" > "$temp"
  chown --reference="$file" "$temp"
  chmod --reference="$file" "$temp"
  mv -f "$temp" "$file"
}

state_token="$(read_env "$STATE_ENV" REMOTE_STATE_TOKEN)"
import_token="$(read_env "$SYNC_ENV" TODO_IMPORT_TOKEN)"
cloud_base_url="$(read_env "$SYNC_ENV" CLOUD_API_BASE_URL)"

[[ -n "$state_token" ]] || { echo 'REMOTE_STATE_TOKEN is missing.' >&2; exit 1; }
[[ -n "$import_token" ]] || { echo 'TODO_IMPORT_TOKEN is missing.' >&2; exit 1; }
[[ -n "$cloud_base_url" ]] || { echo 'CLOUD_API_BASE_URL is missing.' >&2; exit 1; }

set_env "$STATE_ENV" REMOTE_STATE_HOST 0.0.0.0
set_env "$STATE_ENV" REMOTE_STATE_PORT 3100
set_env "$SYNC_ENV" CLOUD_TRIGGER_ENABLED true
set_env "$SYNC_ENV" TRIGGER_REMINDERS true

cloud_config='/root/yyt-cloudrun-env.json'
umask 077
cat > "$cloud_config" <<EOF
{
  "TODO_DATA_SOURCE": "import",
  "STORAGE_MODE": "remote-json",
  "REMOTE_STATE_API_BASE_URL": "http://${PUBLIC_IP}:3100",
  "REMOTE_STATE_TOKEN": "${state_token}",
  "TODO_IMPORT_TOKEN": "${import_token}",
  "REMINDER_SCHEDULE_ENABLED": "false"
}
EOF
chmod 0600 "$cloud_config"

systemctl restart yyt-remote-state.service
curl -fsS --retry 10 --retry-delay 1 --retry-connrefused --max-time 30 http://127.0.0.1:3100/health >/dev/null

cat <<EOF
[YYT] Cloud HTTP test mode enabled.
[YYT] State service: 0.0.0.0:3100
[YYT] CloudRun environment fragment: ${cloud_config}
[YYT] Cloud trigger URL: ${cloud_base_url}

Required external steps:
1. Open Aliyun inbound TCP port 3100 for the test period.
2. Merge ${cloud_config} into Tencent CloudRun environment variables and redeploy.
3. Confirm CloudRun /health reports storage_mode=remote-json.
4. Close public port 3100 after migrating to HTTPS or a private network.

WARNING: HTTP does not encrypt REMOTE_STATE_TOKEN. Use this mode only for a
short, controlled test and never place sensitive todo details in notifications.
EOF

if [[ "$RUN_NOW" == true ]]; then
  systemctl restart yyt-todo-sync.service
  journalctl -u yyt-todo-sync.service -n 80 --no-pager
else
  echo '[YYT] No sync was triggered. Re-run with --run-now after CloudRun is configured.'
fi