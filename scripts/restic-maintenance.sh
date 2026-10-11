#!/usr/bin/env bash
set -Eeuo pipefail
mode=${1:-weekly}
[[ $# -le 1 ]] || exit 2
case "$mode" in weekly|monthly) ;; *) echo 'Usage: scripts/restic-maintenance.sh [weekly|monthly]' >&2; exit 2 ;; esac
exec "$(dirname "${BASH_SOURCE[0]}")/backup.sh" "$mode"
