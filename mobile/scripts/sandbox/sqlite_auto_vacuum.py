#!/usr/bin/env python3
"""
Sandbox: dua jebakan vacuum SQLite yang membuat file database tidak pernah menyusut.

1) `PRAGMA auto_vacuum = INCREMENTAL` pada DB yang tabelnya SUDAH ada tidak berefek tanpa VACUUM sekali
   (DB mobile yang dibuat sebelum M-Mobile-8.29 tetap auto_vacuum=0).
2) `PRAGMA incremental_vacuum` membebaskan SATU halaman per langkah eksekusi. `db.runAsync` expo-sqlite hanya
   melangkah SEKALI (hanya 1 halaman kembali); `db.execAsync` (sqlite3_exec) melangkah sampai selesai.
   Di Python, `cursor.fetchall()` meniru "melangkah sampai habis"; `execute()` tanpa fetch meniru satu langkah.

Jalankan: python3 mobile/scripts/sandbox/sqlite_auto_vacuum.py
"""
import os
import sqlite3
import tempfile


def kb(path):
    return os.path.getsize(path) // 1024


def fill(db, n=3000):
    db.execute("BEGIN")
    for i in range(n):
        db.execute("INSERT INTO m VALUES(?,?)", (i, "y" * 400))
    db.execute("COMMIT")


with tempfile.TemporaryDirectory() as tmp:
    print("-- 1) DB lama: PRAGMA auto_vacuum setelah tabel ada")
    path = os.path.join(tmp, "legacy.db")
    db = sqlite3.connect(path)
    db.isolation_level = None
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE m(id INTEGER PRIMARY KEY, body TEXT)")
    fill(db)
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
    db.close()
    db = sqlite3.connect(path)
    db.isolation_level = None
    db.execute("PRAGMA auto_vacuum = INCREMENTAL")
    print("   auto_vacuum setelah PRAGMA di DB lama :", db.execute("PRAGMA auto_vacuum").fetchone()[0], "(0=NONE, 2=INCREMENTAL)")
    before = kb(path)
    db.execute("DELETE FROM m WHERE id>=500")
    db.execute("PRAGMA incremental_vacuum").fetchall()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
    print(f"   file setelah hapus 2500 baris + incremental_vacuum: {before} KB -> {kb(path)} KB (tidak menyusut)")
    db.execute("PRAGMA auto_vacuum = INCREMENTAL")
    db.execute("VACUUM")
    print("   auto_vacuum setelah VACUUM            :", db.execute("PRAGMA auto_vacuum").fetchone()[0])
    db.close()

    print("\n-- 2) incremental_vacuum: satu langkah vs sampai habis")
    path = os.path.join(tmp, "step.db")
    db = sqlite3.connect(path)
    db.isolation_level = None
    db.executescript("PRAGMA auto_vacuum=INCREMENTAL; PRAGMA journal_mode=WAL; CREATE TABLE m(id INTEGER PRIMARY KEY, body TEXT);")
    fill(db)
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
    db.execute("DELETE FROM m WHERE id>=500")
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
    print(f"   setelah DELETE            : {kb(path)} KB, freelist = {db.execute('PRAGMA freelist_count').fetchone()[0]}")
    db.execute("PRAGMA incremental_vacuum")  # satu langkah (seperti runAsync)
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
    print(f"   1 langkah (runAsync)      : {kb(path)} KB, freelist = {db.execute('PRAGMA freelist_count').fetchone()[0]}")
    db.execute("PRAGMA incremental_vacuum").fetchall()  # sampai habis (seperti execAsync)
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
    print(f"   sampai habis (execAsync)  : {kb(path)} KB, freelist = {db.execute('PRAGMA freelist_count').fetchone()[0]}")
