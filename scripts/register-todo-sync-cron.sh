#!/usr/bin/env sh
set -eu

echo "This cron installer is deprecated."
echo "Use scripts/yyt-todo-sync.service.example and the two systemd timer examples."
echo "Store secrets in /etc/yyt-todo-sync.env with owner root:yyt and mode 0640."
exit 1
