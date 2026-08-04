#!/usr/bin/env bash

set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || { echo 'Run as root or install sudo.' >&2; exit 1; }
  exec sudo bash "$0" "$@"
fi

systemctl disable --now yyt-todo-sync-morning.timer yyt-todo-sync-evening.timer yyt-remote-state.service 2>/dev/null || true
rm -f \
  /etc/systemd/system/yyt-todo-sync-morning.timer \
  /etc/systemd/system/yyt-todo-sync-evening.timer \
  /etc/systemd/system/yyt-todo-sync.service \
  /etc/systemd/system/yyt-remote-state.service
systemctl daemon-reload
rm -rf /opt/yyt-todo

if [[ "${1:-}" == '--purge' ]]; then
  rm -rf /opt/yyt-state /var/log/yyt-todo-sync
  rm -f /etc/yyt-remote-state.env /etc/yyt-todo-sync.env
  userdel yyt 2>/dev/null || true
  printf '[YYT] Application, data, logs and secrets removed.\n'
else
  printf '[YYT] Application removed. Data and secrets were preserved.\n'
  printf '[YYT] Use uninstall.sh --purge only when permanent data deletion is intended.\n'
fi
