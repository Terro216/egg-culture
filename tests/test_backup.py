"""Offline tests use the actual table definitions and entirely synthetic rows."""
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import threading
import unittest
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("egg_snapshot", REPO / "backup/snapshot.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def fixture(root):
    source = root / "source"
    (source / "egg-road").mkdir(parents=True)
    (source / "images").mkdir()
    with sqlite3.connect(source / backup.DB) as db:
        # Read the application's real DDL, independent of REQUIRED_TABLES.
        for file in ("roadRecords.ts", "accountProgress.ts"):
            code = (REPO / "src/server" / file).read_text()
            for ddl in re.findall(r"CREATE TABLE IF NOT EXISTS [a-z_]+ \(.*?\) STRICT;", code, re.S):
                db.execute(ddl)
        db.execute("INSERT INTO players VALUES ('p1', 'Test player', 'test player')")
        db.execute("INSERT INTO accounts VALUES ('p1', 'g1', 'synthetic-password-hash', 'synthetic-recovery-hash', 1)")
        db.execute("INSERT INTO sessions VALUES ('synthetic-token-hash', 'p1', 9999999999, 1)")
        db.execute("INSERT INTO portal_initiation VALUES ('p1', 100)")
        db.execute("INSERT INTO incubator_states VALUES ('p1', '{\"day\":2}')")
        db.execute("INSERT INTO portal_profiles VALUES ('p1', 'public1', 0, 1)")
        db.execute("INSERT INTO portal_stats VALUES ('p1', 'fry', '{\"score\":123}', 4)")
        db.execute("INSERT INTO portal_achievements VALUES ('p1', 'untangle.first')")
        db.execute("INSERT INTO untangle_puzzles VALUES ('p1', 'NEST1-test', 1, 'campaign', NULL, 3, 5, 0, 1, 100)")
    posts = []
    for i, status in enumerate(("pending", "approved", "rejected")):
        identifier = f"00000000-0000-4000-8000-{i:012d}"
        posts.append({"id": identifier, "name": "Test adept", "text": "Synthetic entry",
                      "ipHash": "synthetic", "createdAt": "2026-10-04T00:00:00.000Z",
                      "status": status, "visibility": "adepts" if i == 0 else "public",
                      "image": {"ext": "jpg", "type": "image/jpeg"},
                      "delivery": {"attempts": 1, "nextAttemptAt": 0}})
        (source / "images" / f"{identifier}.jpg").write_bytes(b"\xff\xd8synthetic image")
    (source / "posts.json").write_text(json.dumps({"posts": posts}))
    # Reproducible assets and orphaned files must never enter the payload.
    (source / "private/fonin-gifts").mkdir(parents=True)
    (source / "private/fonin-gifts/certificate.png").write_bytes(b"generated")
    (source / ".env").write_text("SECRET=not-in-backup")
    (source / "images/orphan.jpg").write_bytes(b"\xff\xd8orphan")
    return source


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = fixture(self.root)
        self.target = self.root / "snapshot"

    def test_roundtrip_preserves_credentials_progress_all_statuses_and_privacy(self):
        counts = backup.snapshot(self.source, self.target)
        self.assertEqual(backup.validate(self.target), counts)
        self.assertEqual(counts["posts"], 3)
        self.assertEqual(counts["statuses"], {"pending": 1, "approved": 1, "rejected": 1})
        self.assertEqual((self.target / "posts.json").read_bytes(), (self.source / "posts.json").read_bytes())
        with sqlite3.connect(self.source / backup.DB) as before, sqlite3.connect(self.target / backup.DB) as after:
            for table in counts["tables"]:
                self.assertEqual(before.execute(f'SELECT * FROM "{table}"').fetchall(),
                                 after.execute(f'SELECT * FROM "{table}"').fetchall(), table)
        self.assertEqual(set(backup.inventory(self.target)), {backup.DB, "posts.json", *backup.read_book(self.target)[2]})
        for file in self.target.rglob("*"):
            self.assertEqual(file.stat().st_mode & 0o777, 0o700 if file.is_dir() else 0o600)

    def test_sqlite_online_backup_is_consistent_during_concurrent_transactions(self):
        with sqlite3.connect(self.source / backup.DB) as db:
            db.executescript("CREATE TABLE atomic_a(n INTEGER); CREATE TABLE atomic_b(n INTEGER);"
                             "INSERT INTO atomic_a VALUES(0); INSERT INTO atomic_b VALUES(0);")
        stop, wrote = threading.Event(), threading.Event()
        errors = []

        def writer():
            try:
                with sqlite3.connect(self.source / backup.DB, timeout=10) as db:
                    while not stop.is_set():
                        with db:
                            db.execute("UPDATE atomic_a SET n=n+1")
                            db.execute("UPDATE atomic_b SET n=n+1")
                        wrote.set()
                        stop.wait(0.002)
            except BaseException as error:
                errors.append(error)

        thread = threading.Thread(target=writer)
        thread.start()
        try:
            self.assertTrue(wrote.wait(5))
            backup.snapshot(self.source, self.target)
        finally:
            stop.set()
            thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertFalse(errors)
        with sqlite3.connect(self.target / backup.DB) as db:
            self.assertEqual(db.execute("SELECT n FROM atomic_a").fetchone(), db.execute("SELECT n FROM atomic_b").fetchone())

    def test_freezes_json_before_copying_immutable_images(self):
        frozen = (self.source / "posts.json").read_bytes()
        copy = backup.shutil.copyfile

        def concurrent_moderation(src, dst, **kwargs):
            (self.source / "posts.json").write_text('{"posts": []}')
            return copy(src, dst, **kwargs)

        with mock.patch.object(backup.shutil, "copyfile", side_effect=concurrent_moderation):
            backup.snapshot(self.source, self.target)
        self.assertEqual((self.target / "posts.json").read_bytes(), frozen)
        self.assertEqual(backup.validate(self.target)["images"], 3)

    def test_missing_image_fails_and_removes_incomplete_snapshot(self):
        (self.source / backup.read_book(self.source)[2][0]).unlink()
        with self.assertRaises(FileNotFoundError):
            backup.snapshot(self.source, self.target)
        self.assertFalse(self.target.exists())

    def test_empty_database_cannot_pass_as_successful_backup(self):
        with sqlite3.connect(self.source / backup.DB) as db:
            db.execute("DROP TABLE accounts")
        with self.assertRaisesRegex(ValueError, "tables are missing"):
            backup.snapshot(self.source, self.target)

    def test_never_overwrites_an_existing_snapshot(self):
        backup.snapshot(self.source, self.target)
        before = backup.inventory(self.target)
        with self.assertRaises(FileExistsError):
            backup.snapshot(self.source, self.target)
        self.assertEqual(backup.inventory(self.target), before)

    def test_symlink_image_is_rejected(self):
        image = self.source / backup.read_book(self.source)[2][0]
        image.unlink()
        image.symlink_to(self.source / ".env")
        with self.assertRaisesRegex(ValueError, "ordinary file"):
            backup.snapshot(self.source, self.target)

    def test_duplicate_ids_and_path_traversal_are_rejected(self):
        original = json.loads((self.source / "posts.json").read_text())
        for identifier in (original["posts"][1]["id"], "../../private/certificate"):
            with self.subTest(identifier=identifier):
                original["posts"][0]["id"] = identifier
                (self.source / "posts.json").write_text(json.dumps(original))
                with self.assertRaises(ValueError):
                    backup.snapshot(self.source, self.target)

    def test_detects_image_corruption_extra_files_and_manifest_count_tampering(self):
        backup.snapshot(self.source, self.target)
        image = self.target / backup.read_book(self.target)[2][0]
        before = image.read_bytes()
        image.write_bytes(before + b"corrupt")
        with self.assertRaisesRegex(ValueError, "checksum"):
            backup.validate(self.target)
        image.write_bytes(before)
        extra = self.target / "unwanted-certificate.png"
        extra.write_bytes(b"excluded")
        with self.assertRaisesRegex(ValueError, "checksum"):
            backup.validate(self.target)
        extra.unlink()
        manifest = json.loads((self.target / "manifest.json").read_text())
        manifest["counts"]["tables"]["accounts"] += 1
        (self.target / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "counts"):
            backup.validate(self.target)

    def test_manifest_cannot_reference_files_outside_restore(self):
        backup.snapshot(self.source, self.target)
        manifest = json.loads((self.target / "manifest.json").read_text())
        manifest["files"]["../source/.env"] = {"bytes": 20, "sha256": "fake"}
        (self.target / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            backup.validate(self.target)


if __name__ == "__main__":
    unittest.main()
