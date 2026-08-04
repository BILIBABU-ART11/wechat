#!/usr/bin/env bash

set -u

printf '%s\n' '=== YYT diagnostics ==='
printf 'Time: %s\n' "$(date --iso-8601=seconds 2>/dev/null || date)"
printf 'OS: '
(. /etc/os-release && printf '%s %s\n' "$ID" "${VERSION_ID:-unknown}") 2>/dev/null || printf 'unknown\n'
printf 'Node: '
node --version 2>/dev/null || printf 'not installed\n'
printf 'Public IPv4: '
curl -4fsS --connect-timeout 5 --max-time 10 https://api.ipify.org 2>/dev/null || printf 'unavailable'
printf '\n\n=== State service health ===\n'
curl -fsS --connect-timeout 3 http://127.0.0.1:3100/health 2>/dev/null || printf 'unhealthy\n'
printf '\n\n=== Services ===\n'
systemctl --no-pager --full status yyt-remote-state.service yyt-todo-sync.service 2>&1 | tail -n 80
printf '\n=== Timers ===\n'
systemctl list-timers --all --no-pager 2>/dev/null | grep -E 'yyt|NEXT|^$' || true
printf '\n=== Latest sync log ===\n'
journalctl -u yyt-todo-sync.service -n 100 --no-pager 2>&1
printf '\n=== Files ===\n'
for file in /opt/yyt-state/yyt-state.json /var/log/yyt-todo-sync/todo-sync-latest.json; do
  if [[ -f "$file" ]]; then
    stat -c '%A %U:%G %s bytes %y %n' "$file" 2>/dev/null || ls -l "$file"
  else
    printf 'missing: %s\n' "$file"
  fi
done
