#!/usr/bin/env bash
set -Eeuo pipefail
export RESTIC_PASSWORD="$BACKUP_PASSWORD" RESTIC_REPOSITORY="$YANDEX_DISK_TARGET" RESTIC_CACHE_DIR=/tmp/restic-cache
expect_failure() {
    local label=$1
    shift
    if "$@" >/tmp/expected-error.log 2>&1; then echo "Unexpected success: $label"; exit 1; fi
    printf 'PASS: %s\n' "$label"
}
expect_failure 'uninitialized repository fails without auto-init' egg-backup backup
[[ ! -e /repository/config ]]
egg-backup init
egg-backup backup
before=$(sha256sum /backup/current/manifest.json)
id=$(restic snapshots --json --tag egg-culture | jq -er '.[0].id')
egg-backup restore "$id"
egg-backup monthly
egg-backup weekly
exec 8>/backup/.backup.lock
flock -n 8
mkdir /backup/pending
printf 'keep' >/backup/pending/sentinel
expect_failure 'concurrent run cannot remove pending staging' egg-backup backup
[[ $(cat /backup/pending/sentinel) == keep ]]
flock -u 8
exec 8>&-
rm -rf /backup/pending
repo_config=$(sha256sum /repository/config)
expect_failure 'wrong password fails without reinitializing repository' env BACKUP_PASSWORD=wrong-test-key egg-backup backup
[[ $(sha256sum /repository/config) == "$repo_config" ]]
[[ $(sha256sum /backup/current/manifest.json) == "$before" ]]
image=$(find /sources/kladka/images -type f -name '000*.jpg' | head -1)
mv "$image" /tmp/missing.jpg
expect_failure 'missing referenced photo keeps last good generation' egg-backup backup
[[ $(sha256sum /backup/current/manifest.json) == "$before" && ! -e /backup/pending ]]
mv /tmp/missing.jpg "$image"
egg-backup backup
[[ -f /backup/previous/manifest.json ]]
egg-backup export "$id"
expect_failure 'export refuses overwrite' egg-backup export "$id"
printf 'other snapshot' >/tmp/foreign
restic backup --json --host deployment-host --tag foreign /tmp/foreign >/tmp/foreign.json
foreign=$(jq -r 'select(.message_type == "summary") | .snapshot_id' /tmp/foreign.json)
expect_failure 'foreign snapshot cannot pass Egg Culture restore' egg-backup restore "$foreign"
egg-backup restore latest
printf 'PASS: real restic backup, rotation, retention, check, restore, export and failure guards\n'
