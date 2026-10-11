"""Data-only online snapshot and offline validation; never imports the app.

Kladka publishes posts.json by atomic rename AFTER fsync of each immutable
image. Freeze that JSON first, then copy exactly its referenced images. SQLite
has its own consistent snapshot; there is no transaction shared with Kladka.
"""

import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import stat
import sys
import time

DB = "egg-road/records.sqlite"
REQUIRED_TABLES = {
    "accounts", "players", "sessions", "auth_limits", "records",
    "road_completions", "portal_profiles", "portal_stats", "portal_achievements",
    "portal_submissions", "portal_migrations", "portal_profile_slug_aliases",
    "portal_initiation", "incubator_states", "manifesto_progress",
    "untangle_puzzles", "untangle_guest_claims",
}
IMAGE_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_file(root, name):
    """Only ordinary files under this root, with no symlink components."""
    relative = PurePosixPath(name)
    require(not relative.is_absolute() and name == relative.as_posix()
            and all(part not in (".", "..") for part in relative.parts)
            and bool(relative.parts), "Unsafe artifact path")
    require(not root.is_symlink() and root.is_dir(), "Unsafe data directory")
    current = root
    for index, part in enumerate(relative.parts):
        current = current / part
        mode = current.lstat().st_mode
        require(stat.S_ISREG(mode) if index == len(relative.parts) - 1 else stat.S_ISDIR(mode),
                "Artifact is not an ordinary file or directory")
    return current


def read_book(root):
    book = safe_file(root, "posts.json").read_bytes()
    data = json.loads(book)
    require(isinstance(data, dict) and isinstance(data.get("posts"), list), "Invalid Book")
    posts, identifiers, images = data["posts"], set(), []
    for post in posts:
        require(isinstance(post, dict), "Invalid Book entry")
        identifier = post.get("id")
        require(isinstance(identifier, str) and re.fullmatch(r"[a-f0-9-]{1,128}", identifier)
                and identifier not in identifiers, "Invalid or duplicate Book ID")
        identifiers.add(identifier)
        require(all(isinstance(post.get(key), str) for key in ("name", "text", "ipHash", "createdAt")),
                "Invalid Book entry fields")
        require(post.get("status") in ("pending", "approved", "rejected"), "Invalid moderation status")
        require(post.get("visibility") in (None, "public", "adepts"), "Invalid Book visibility")
        image = post.get("image")
        if image is not None:
            require(isinstance(image, dict) and isinstance(image.get("ext"), str)
                    and image.get("ext") in IMAGE_TYPES
                    and image.get("type") == IMAGE_TYPES[image["ext"]], "Invalid image metadata")
            images.append(f"images/{identifier}.{image['ext']}")
    return book, posts, images


def check_image(file):
    require(0 < file.stat().st_size <= 5 * 1024 * 1024, "Invalid image size")
    with file.open("rb") as stream:
        header = stream.read(16)
    valid = {
        ".jpg": header.startswith(b"\xff\xd8"),
        ".png": header.startswith(b"\x89PNG"),
        ".gif": header.startswith(b"GIF8"),
        ".webp": len(header) > 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP",
    }
    require(valid.get(file.suffix, False), "Image format does not match metadata")


def database_counts(file):
    with closing(sqlite3.connect(file.as_uri() + "?mode=ro", uri=True, timeout=10)) as db:
        require(db.execute("PRAGMA integrity_check").fetchall() == [("ok",)], "SQLite integrity check failed")
        require(not db.execute("PRAGMA foreign_key_check").fetchall(), "SQLite foreign key check failed")
        tables = [row[0] for row in db.execute(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        require(REQUIRED_TABLES <= set(tables), "Required account/progress tables are missing")
        # Include future application tables automatically, not only this baseline.
        return {table: db.execute('SELECT count(*) FROM "' + table.replace('"', '""') + '"').fetchone()[0]
                for table in tables}


def inspect_payload(root):
    _, posts, images = read_book(root)
    for name in images:
        check_image(safe_file(root, name))
    return {
        "tables": database_counts(safe_file(root, DB)),
        "posts": len(posts),
        "statuses": dict(sorted(Counter(post["status"] for post in posts).items())),
        "images": len(images),
    }, {DB, "posts.json", *images}


def inventory(root):
    files = {}
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in dirs:
            require(not (Path(directory) / name).is_symlink(), "Symlink directory in snapshot")
        for name in names:
            relative = (Path(directory) / name).relative_to(root).as_posix()
            file = safe_file(root, relative)
            if relative == "manifest.json":
                continue
            digest = hashlib.sha256()
            with file.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            files[relative] = {"bytes": file.stat().st_size, "sha256": digest.hexdigest()}
    return files


def snapshot(source, target):
    source, target = Path(source).absolute(), Path(target).absolute()
    require(not source.is_symlink(), "Symlink source directory")
    require(not target.is_relative_to(source) and not source.is_relative_to(target),
            "Snapshot and source must be separate")
    book, _, images = read_book(source)
    database = safe_file(source, DB)
    target.mkdir(mode=0o700)  # Never overwrite another snapshot.
    try:
        (target / "egg-road").mkdir(mode=0o700)
        (target / "images").mkdir(mode=0o700)
        (target / "posts.json").write_bytes(book)
        (target / "posts.json").chmod(0o600)
        deadline = time.monotonic() + 60

        def progress(_status, _remaining, _total):
            require(time.monotonic() < deadline, "SQLite snapshot timed out")

        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=10)) as src:
            with closing(sqlite3.connect(target / DB)) as dst:
                src.backup(dst, pages=256, sleep=0.05, progress=progress)
        (target / DB).chmod(0o600)
        for name in images:
            shutil.copyfile(safe_file(source, name), target / name, follow_symlinks=False)
            (target / name).chmod(0o600)
        counts, expected = inspect_payload(target)
        files = inventory(target)
        require(set(files) == expected, "Unexpected snapshot artifacts")
        manifest = {
            "format": 1, "application": "egg-culture",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "counts": counts, "files": files,
        }
        (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (target / "manifest.json").chmod(0o600)
        validate(target)
        return counts
    except BaseException:
        shutil.rmtree(target)
        raise


def validate(root):
    root = Path(root).absolute()
    manifest = json.loads(safe_file(root, "manifest.json").read_bytes())
    require(isinstance(manifest, dict) and manifest.get("format") == 1
            and manifest.get("application") == "egg-culture", "Unsupported snapshot manifest")
    require(isinstance(manifest.get("files"), dict), "Missing artifact inventory")
    for name in manifest["files"]:
        safe_file(root, name)
    counts, expected = inspect_payload(root)
    require(set(manifest["files"]) == expected, "Manifest artifact set does not match the Book")
    require(inventory(root) == manifest["files"], "Snapshot file set or checksum mismatch")
    require(counts == manifest.get("counts"), "Restored counts differ from the manifest")
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("snapshot")
    create.add_argument("source")
    create.add_argument("target")
    check = sub.add_parser("validate")
    check.add_argument("root")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        result = snapshot(args.source, args.target) if args.command == "snapshot" else validate(args.root)
        print(json.dumps({"result": "ok", "counts": result}, sort_keys=True))
    except (OSError, ValueError, sqlite3.Error):
        # No row values, user filenames, credentials or database error text in logs.
        print("Data validation failed; inspect the protected staging data", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
