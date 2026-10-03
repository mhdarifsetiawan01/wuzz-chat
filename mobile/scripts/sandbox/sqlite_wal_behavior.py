#!/usr/bin/env python3
"""
Sandbox: mengapa file WAL SQLite bertahan besar dan apa yang menyusutkannya.

Terukur di HP (4 Okt 2026): wuzzchat.db 328 KB tetapi wuzzchat.db-wal 4,17 MB. Skrip ini mereproduksi angkanya dengan
pola tulis app (sinkronisasi riwayat menulis ulang ±500 baris dalam satu transaksi, berkali-kali) dan membandingkan:
  A. kode lama (tanpa batas, tanpa truncate)   -> WAL tertahan ±4 MB (ambang auto-checkpoint 1000 halaman)
  B. PRAGMA journal_size_limit saja            -> WAL dibatasi saat checkpoint
  C. wal_checkpoint(TRUNCATE) saja             -> WAL kembali 0 hanya saat dipanggil
  D. keduanya (yang dipakai app sekarang)      -> kecil saat dipakai, 0 setelah maintenance

Jalankan: python3 mobile/scripts/sandbox/sqlite_wal_behavior.py
"""
import os
import sqlite3
import tempfile


def run(label, journal_limit, truncate_at_end):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "wal.db")
        db = sqlite3.connect(path)
        db.isolation_level = None
        db.execute("PRAGMA auto_vacuum=INCREMENTAL")
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=NORMAL")
        if journal_limit:
            db.execute(f"PRAGMA journal_size_limit={journal_limit}")
        db.execute(
            "CREATE TABLE m(user TEXT,id TEXT,room TEXT,created TEXT,raw TEXT,PRIMARY KEY(user,id))"
        )
        for rnd in range(40):
            db.execute("BEGIN")
            for i in range(500):
                db.execute(
                    "INSERT OR REPLACE INTO m VALUES(?,?,?,?,?)",
                    ("u", f"id{i}", "room", f"2026-{rnd:02d}-{i:04d}", "x" * 180),
                )
            db.execute("COMMIT")
        wal_during = os.path.getsize(path + "-wal")
        if truncate_at_end:
            db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
        wal_after = os.path.getsize(path + "-wal") if os.path.exists(path + "-wal") else 0
        print(
            f"{label:58s} WAL setelah sinkronisasi: {wal_during / 1e6:5.2f} MB | "
            f"setelah maintenance: {wal_after / 1e6:5.2f} MB | db: {os.path.getsize(path) / 1e6:4.2f} MB"
        )


if __name__ == "__main__":
    run("A. KODE LAMA (tanpa batas, tanpa truncate)", None, False)
    run("B. journal_size_limit=1MB saja", 1048576, False)
    run("C. maintenance wal_checkpoint(TRUNCATE) saja", None, True)
    run("D. BARU: journal_size_limit + TRUNCATE di maintenance", 1048576, True)
