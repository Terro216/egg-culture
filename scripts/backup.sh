#!/usr/bin/env bash
# Compose runs the worker where Docker runs (big-one under the remote shim).
# No host-side staging, locks, sourcing .env, or dependency on the web image.
set -Eeuo pipefail
umask 077
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
mode=${1:-run}
case "$mode" in
    run|build|init|weekly|monthly) [[ $# -le 1 ]] || exit 2 ;;
    validate|drill|export) [[ $# -le 2 ]] || exit 2 ;;
    *) echo 'Usage: scripts/backup.sh [build|init|run|weekly|monthly|validate|drill|export] [snapshot]' >&2; exit 2 ;;
esac
compose=(docker compose --project-directory "$repo" -f "$repo/docker-compose.yml")
if [[ "$mode" == build ]]; then
    exec "${compose[@]}" --profile backup build backup
fi
[[ -f "$repo/.env.backup" ]] || { echo 'Configure .env.backup from backup.env.example first' >&2; exit 1; }
# `compose run` has no --no-build flag. Require the prepared image and disable
# pulls, so ordinary jobs never depend on an implicit image build/download.
docker image inspect egg-culture-backup:restic-0.19.1-rclone-1.74.4 >/dev/null \
    || { echo 'Build the backup image with scripts/backup.sh build first' >&2; exit 1; }
# Fixed host paths are declared in Compose. Only the worker consumes this env
# file (raw values), so passwords cannot become shell code or Compose syntax.
case "$mode" in
    run) mode=backup ;;
    validate|drill) mode=restore ;;
esac
exec "${compose[@]}" --profile backup run --rm --no-deps --pull never -T backup "$mode" "${2:-latest}"
