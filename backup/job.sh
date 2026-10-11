#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

mode=${1:-backup}
snapshot=${2:-latest}
case "$mode" in backup|init|weekly|monthly|restore|export) ;; *) echo 'Unknown backup operation' >&2; exit 2 ;; esac
[[ $# -le 2 ]] || exit 2
[[ "$snapshot" == latest || "$snapshot" =~ ^[0-9a-f]{8,64}$ ]] || { echo 'Invalid snapshot ID' >&2; exit 2; }
: "${BACKUP_PASSWORD:?Set BACKUP_PASSWORD in .env.backup}"
: "${YANDEX_DISK_TARGET:?Set YANDEX_DISK_TARGET in .env.backup}"
export RESTIC_PASSWORD="$BACKUP_PASSWORD" RESTIC_REPOSITORY="$YANDEX_DISK_TARGET"
export RCLONE_CONFIG=/config/rclone/rclone.conf RESTIC_CACHE_DIR=/tmp/restic-cache
host=${BACKUP_HOST:-big-one}
tag=egg-culture
daily=${BACKUP_KEEP_DAILY:-7}
weekly=${BACKUP_KEEP_WEEKLY:-8}
[[ "$daily" =~ ^[1-9][0-9]*$ && "$weekly" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid retention' >&2; exit 2; }
scope=(--host "$host" --tag "$tag")
pending=/backup/pending
work=''
push=''
case "$mode" in
    backup) push=${BACKUP_PUSH_URL:-} ;;
    weekly) push=${BACKUP_PUSH_URL_WEEKLY:-} ;;
    monthly) push=${BACKUP_PUSH_URL_MONTHLY:-} ;;
esac
if [[ -n "$push" ]]; then
    [[ "$push" =~ ^https://[a-zA-Z0-9./_:-]+$ && "${BACKUP_PUSH_TOKEN:-}" =~ ^[a-zA-Z0-9._-]+$ ]] \
        || { echo 'Invalid heartbeat configuration' >&2; exit 2; }
fi

# Every operation, including restore and maintenance, shares this lock. Take it
# BEFORE traps: a competing process must never clean up another run's staging.
exec 9>/backup/.backup.lock
flock -n 9 || { echo 'Another Egg Culture backup operation is running' >&2; exit 75; }

notify() {
    [[ -n "$push" ]] || return 0
    local config
    config=$(mktemp /tmp/egg-heartbeat.XXXXXX)
    printf 'header = "Authorization: Bearer %s"\n' "$BACKUP_PUSH_TOKEN" >"$config"
    local result=0
    curl --config "$config" --retry 2 --max-time 15 -fsS -X POST \
        "${push}?success=$1" >/dev/null 2>&1 || result=$?
    rm -f "$config"
    if (( result != 0 )); then echo 'Backup heartbeat delivery failed' >&2; return 1; fi
}

cleanup() {
    local status=$?
    trap - EXIT
    [[ -z "$work" ]] || rm -rf -- "$work"
    if [[ "$mode" == backup ]]; then rm -rf -- "$pending"; fi
    if (( status == 0 )); then notify true || status=1; else notify false || true; fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
work=$(mktemp -d /backup/.work.XXXXXX)

resolve_snapshot() {
    local requested=$1
    local selector=("$requested")
    [[ "$requested" != latest ]] || selector=(--latest 1)
    restic snapshots --json "${scope[@]}" "${selector[@]}" >"$work/snapshots.json"
    jq -er --arg host "$host" --arg tag "$tag" '
        if length == 1 and .[0].hostname == $host and (.[0].tags | index($tag)) != null
            and .[0].paths == ["/backup/pending"]
        then .[0].id else error("No unique matching Egg Culture snapshot") end
    ' "$work/snapshots.json"
}

restore_snapshot() {
    local id
    id=$(resolve_snapshot "$1")
    [[ "$id" =~ ^[0-9a-f]{64}$ ]] || { echo 'Missing full snapshot ID' >&2; return 1; }
    restic restore "$id" --verify --target "$work/restore"
    python3 /opt/egg-backup/snapshot.py validate "$work/restore/backup/pending"
    if [[ "$mode" == export ]]; then
        mkdir -p /backup/exports
        [[ ! -e "/backup/exports/$id" ]] || { echo 'Export already exists; refusing overwrite' >&2; return 1; }
        mv "$work/restore/backup/pending" "/backup/exports/$id"
        echo "Validated export: /backup/exports/$id"
    fi
    echo "Restore validation complete: $id"
}

case "$mode" in
    init)
        # Explicit one-time operation. A failed read during a normal job must
        # never be mistaken for an empty repository and trigger initialization.
        restic init
        ;;
    backup)
        restic cat config >/dev/null
        rm -rf -- "$pending"
        python3 /opt/egg-backup/snapshot.py snapshot /sources/kladka "$pending"
        restic backup --json "${scope[@]}" "$pending" >"$work/backup.json"
        id=$(jq -r 'select(.message_type == "summary") | .snapshot_id // empty' "$work/backup.json")
        [[ "$id" =~ ^[0-9a-f]{64}$ ]] || { echo 'No completed snapshot ID' >&2; exit 1; }
        [[ "$(resolve_snapshot "$id")" == "$id" ]] || exit 1
        restic forget "${scope[@]}" --group-by host,tags --keep-daily "$daily" --keep-weekly "$weekly"
        # A failed upload or retention never replaces the last good local copy.
        rm -rf /backup/previous
        [[ ! -d /backup/current ]] || mv /backup/current /backup/previous
        mv "$pending" /backup/current
        echo "Backup complete: $id"
        ;;
    weekly)
        restic prune --max-unused 10%
        restic check
        ;;
    monthly)
        restic check --read-data
        restore_snapshot latest
        ;;
    restore|export)
        restore_snapshot "$snapshot"
        ;;
esac
