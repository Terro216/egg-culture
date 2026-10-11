#!/usr/bin/env bash
set -Eeuo pipefail
mode=${1:-validate}
[[ $# -le 2 ]] || exit 2
case "$mode" in
    validate|drill|export) ;;
    *) echo 'Usage: scripts/restore.sh [validate|drill|export] [snapshot]' >&2; exit 2 ;;
esac
exec "$(dirname "${BASH_SOURCE[0]}")/backup.sh" "$mode" "${2:-latest}"
