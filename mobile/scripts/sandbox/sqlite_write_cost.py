#!/usr/bin/env python3
"""
Sandbox: biaya penulisan (halaman WAL) menulis ulang baris yang TIDAK berubah.

Skema meniru local_messages (kunci UUID acak, dua indeks). Auto-checkpoint dimatikan agar setiap halaman yang ditulis
terhitung di WAL. Hasil acuan (4 Okt 2026, SQLite 3.37): 50 baris tidak berubah ditulis ulang lewat
INSERT OR REPLACE = ±80 KB; UPSERT (ON CONFLICT DO UPDATE) = ±8 KB; hanya yang berubah = 0 KB.

Pakai ulang untuk tabel lain (mis. local_conversations) dengan mengganti skema dan baris di make().
Jalankan: python3 mobile/scripts/sandbox/sqlite_write_cost.py
"""
import json
import os
import sqlite3
import tempfile
import uuid

COLS = (
    "user_id,id,room_id,sender_id,sender_nickname,content,type,status,reply_to_id,"
    "media_url,local_media_uri,created_at,raw_json"
)


def fresh(tmp):
    path = os.path.join(tmp, "amp.db")
    db = sqlite3.connect(path)
    db.isolation_level = None
    db.execute("PRAGMA auto_vacuum=INCREMENTAL")
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("PRAGMA wal_autocheckpoint=0")
    db.execute(
        """CREATE TABLE local_messages(user_id TEXT NOT NULL,id TEXT NOT NULL,room_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,sender_nickname TEXT,content TEXT,type TEXT DEFAULT 'text',status TEXT DEFAULT 'sent',
        reply_to_id TEXT,media_url TEXT,local_media_uri TEXT,created_at TEXT NOT NULL,raw_json TEXT NOT NULL,
        PRIMARY KEY(user_id,id))"""
    )
    db.execute("CREATE INDEX idx_msg_user_room_created ON local_messages(user_id,room_id,created_at DESC)")
    db.execute("CREATE INDEX idx_msg_user_room_media ON local_messages(user_id,room_id,type,created_at DESC)")
    return db, path


def make(n, rooms=8):
    out = []
    for r in range(rooms):
        for i in range(n):
            mid = str(uuid.uuid4())
            raw = json.dumps(
                {"id": mid, "content": f"Halo ini pesan percobaan nomor {i} " + "x" * 120, "status": "delivered"}
            )
            out.append(
                (
                    "u", mid, f"room{r}", "u2", "Peer", f"isi {i}", "text", "delivered", None, None, None,
                    "2026-10-%02dT10:%02d:%02d.000Z" % (i % 28 + 1, i % 60, i % 60), raw,
                )
            )
    return out


def wal_size(path):
    return os.path.getsize(path + "-wal") if os.path.exists(path + "-wal") else 0


def cost(rows_to_write, mode):
    with tempfile.TemporaryDirectory() as tmp:
        db, path = fresh(tmp)
        data = make(50)
        db.execute("BEGIN")
        for r in data:
            db.execute(f"INSERT INTO local_messages({COLS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", r)
        db.execute("COMMIT")
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
        room = [r for r in data if r[2] == "room0"][:rows_to_write]
        before = wal_size(path)
        db.execute("BEGIN")
        for r in room:
            if mode == "replace":
                db.execute(f"INSERT OR REPLACE INTO local_messages({COLS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", r)
            else:
                db.execute(
                    f"""INSERT INTO local_messages({COLS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(user_id,id) DO UPDATE SET room_id=excluded.room_id,sender_id=excluded.sender_id,
                    sender_nickname=excluded.sender_nickname,content=excluded.content,type=excluded.type,
                    status=excluded.status,reply_to_id=excluded.reply_to_id,media_url=excluded.media_url,
                    local_media_uri=excluded.local_media_uri,created_at=excluded.created_at,raw_json=excluded.raw_json""",
                    r,
                )
        db.execute("COMMIT")
        return (wal_size(path) - before) / 1024


if __name__ == "__main__":
    print("Menulis ulang pesan yang TIDAK berubah (8 room x 50 pesan, kunci UUID acak, 2 indeks):\n")
    print(f"{'pola':52s} {'baris':>6s} {'WAL ditulis':>14s}")
    for mode, label in (
        ("replace", "INSERT OR REPLACE semua baris (kode lama)"),
        ("upsert", "UPSERT semua baris"),
    ):
        kb = cost(50, mode)
        print(f"{label:52s} {50:6d} {kb:11.0f} KB (~{kb / 4:.0f} halaman)")
    print(f"{'hanya baris yang berubah (0 berubah)':52s} {0:6d} {0:11.0f} KB (~0 halaman)")
    print("\nSatu pesan berubah di antara 50:")
    for label, rows, mode in (
        ("tulis ulang 50 baris (kode lama)", 50, "replace"),
        ("hanya 1 baris, INSERT OR REPLACE", 1, "replace"),
        ("hanya 1 baris, UPSERT (dipakai sekarang)", 1, "upsert"),
    ):
        print(f"  {label:50s} {cost(rows, mode):6.0f} KB")
