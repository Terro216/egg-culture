#!/usr/bin/env bash
# End-to-end rehearsal with synthetic data only. No host mounts or network.
# Build the worker first with scripts/backup.sh build.
set -Eeuo pipefail
umask 077
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
PYTHONDONTWRITEBYTECODE=1 python3 - "$repo" "$temporary" <<'PY'
import importlib.util
from pathlib import Path
import sys
repo, target = map(Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location("backup_tests", repo / "tests/test_backup.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.fixture(target).rename(target / "kladka")
PY
cp "$repo/tests/backup-smoke.sh" "$temporary/run.sh"
tar -C "$temporary" -cf - kladka run.sh | docker run --rm -i \
    --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --memory 384m --cpus 1 --pids-limit 128 \
    --tmpfs /tmp:mode=0700,size=128m --tmpfs /sources:mode=0700,size=32m \
    --tmpfs /backup:mode=0700,size=64m --tmpfs /repository:mode=0700,size=64m \
    --env BACKUP_PASSWORD=synthetic-offline-test-key --env YANDEX_DISK_TARGET=/repository \
    --entrypoint /bin/bash egg-culture-backup:restic-0.19.1-rclone-1.74.4 \
    -ec 'tar -C /sources -xf -; bash /sources/run.sh'
