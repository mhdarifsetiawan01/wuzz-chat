# 🎮 Domain: Game Harian Wuzz Grid (`GAME_WUZZ_GRID`)

Spesifikasi definitif domain **game puzzle harian**: puzzle, percobaan, streak, papan skor (teman, grup, publik), pengingat, dan moderasi papan publik. Rancangan dan riwayat keputusan: [`docs/plans/archived/28-10-2026-backlog-selesai/DAILY_GAME_WUZZ_GRID.md`](../plans/archived/28-10-2026-backlog-selesai/DAILY_GAME_WUZZ_GRID.md). Kontrak API: [`BACKEND_API.md` bagian 3.13](../BACKEND_API.md) dan `docs/openapi.yaml`.

---

## 📋 1. Aturan Bisnis & Invarian

1. **Puzzle**: grid N×N (6-9; Senin-Selasa 6, Rabu-Kamis 7, Jumat-Sabtu 8, Minggu 9) dengan N wilayah terhubung. Satu bintang per baris, kolom, dan wilayah; dua bintang tidak boleh bersentuhan (termasuk diagonal). **Setiap puzzle wajib memiliki tepat satu solusi** dan wilayah terkecil ≥ 3 sel (`internal/game/generator.go`, deterministik dari seed tanggal).
2. **Tanggal puzzle = tanggal kalender LOKAL pengguna** (zona waktu dari `game_settings.tz`, bawaan `Asia/Jakarta`), bukan UTC. Zona waktu hanya dapat diganti sekali per 24 jam.
3. **Solusi tidak pernah dikirim ke klien** (`Puzzle.Solution` bertag `json:"-"`; ada tes). Waktu penyelesaian dihitung **server** dari `started_at`; klien tidak mengirim waktu.
4. **Anti-curang**: penyelesaian lebih cepat dari `0,5 detik × ukuran` berstatus `suspicious` (tidak masuk papan skor dan tidak menaikkan streak). `submit` idempoten dan aman terhadap permintaan serentak (hanya satu yang menang `CompleteAttempt`).
5. **Streak** (`internal/game/streak.go`, murni): dihitung saat menyelesaikan puzzle; 1 pembeku per minggu lokal (Senin), terpakai otomatis bila tepat satu hari terlewat. Tampilan `EffectiveStreak` menampilkan 0 bila sudah pasti putus.
6. **Papan skor** (`ListBoard`): hanya status `solved`; maksimum 50 baris; blokir dua arah menyembunyikan pengguna dari sudut pandang pemanggil.
   - `friends`: Anda + koneksi `accepted`. `group`: anggota grup induk `grp_` (pemanggil wajib anggota). `public`: pengguna dengan `leaderboard_public = true` dan tidak ada di `game_board_hides`.
   - **Privasi papan publik ditegakkan di server**: `display_name` dikosongkan dan `avatar_url` tidak dikirim; hanya `@username` dan hasil (keputusan 26 Okt 2026, karena gerbang usia hanya pernyataan 13+).
   - `hide_from_social = true` menyembunyikan pemilik dari papan `friends` dan `group` orang lain (barisnya sendiri tetap terlihat). Tidak memengaruhi papan publik maupun streak.
7. **Pengingat harian** = notifikasi **lokal** di perangkat (tanpa push server). Jam dari server (`GAME_REMINDER_TIME`, bawaan 19:00, tanpa build baru); 8 kalimat netral bergantian; dijadwalkan 3 hari ke depan; dilewati bila puzzle hari itu selesai. Pilihan menyala disimpan per akun di perangkat dan dicatat ke server (`reminder_enabled`).
8. **Sakelar**: `GAME_ENABLED` (bawaan **mati**). Mati → `today` menjawab `{"enabled": false}`, endpoint lain `403`. Tidak ada kuota Free/Pro, poin, atau iklan di game (lihat `ADS_AND_REWARDS_PLAN.md`; setiap perubahan yang menyentuhnya wajib diputuskan bersama).
9. **Moderasi**: staf dapat mengeluarkan akun dari papan publik (`POST /api/admin/users/{id}/game-board`, catatan wajib, audit append-only di `game_board_audit`). Laporan dari baris papan publik memakai laporan pengguna yang ada.
10. **Hapus akun** menghapus `game_attempts`, `game_streaks`, `game_settings`, `game_board_hides`, `game_board_audit` (`store/account_eraser.go`).

## 🗺️ 2. Peta Kode

| Lapisan | Berkas |
|---|---|
| Logika murni | `backend/internal/game/{solver,generator,streak}.go` |
| Service & kontrak | `game/{service,repository,entity}.go`, SQL di `game/infra/sql_repository.go` |
| HTTP | `api/game_handler.go` (`/api/game/*`), `api/moderation_game.go` (admin) |
| Tabel & migrasi | `store/sql.go` (`game_puzzles`, `game_attempts`, `game_streaks`, `game_settings`, `game_board_hides`, `game_board_audit`) |
| Mobile | `mobile/src/{api/gameApi.ts, hooks/useGameToday.ts, screens/GameScreen.tsx, components/game/*, services/{gameStorage,gameReminder}.ts, utils/{gameBoard,gameReminder}.ts}` |
| Admin web | `frontend/app/admin/users/[id]/page.tsx` (tombol papan publik), `frontend/lib/admin-api.ts` |
| Tes | `backend/internal/game/*_test.go`, `api/game_handler_test.go`, `api/moderation_game_test.go`, `mobile/scripts/test/game-*.test.js` |

## ⚠️ 3. Jebakan & Catatan Operasional

- **Menambah kolom pada tabel yang sudah ada di produksi** (mis. `hide_from_social`) wajib lewat `ALTER ... ADD COLUMN IF NOT EXISTS` (Postgres) dan `ALTER` biasa (SQLite) di `autoMigrate`, bukan hanya di `CREATE TABLE`; ada tes migrasi (`migration_test.go`).
- **Epoch nomor puzzle** (`gridEpoch` di `service.go`, 2026-10-25) harus tidak lebih lambat dari hari pertama fitur menyala: nomor 0 hilang dari JSON (`omitempty`) dan tampil sebagai `#undefined` di klien.
- **Menguji di Postgres**: jalankan kontainer sementara (`postgres:16-alpine`, port 54329) dan `PG_TEST_ADMIN_DSN`; SQLite tidak menegakkan `VARCHAR(n)` sehingga bug panjang kolom hanya terlihat di Postgres.
- **Zona waktu**: klien menyinkronkan zona perangkat ke server sebelum menampilkan puzzle; server menolak ganti zona lebih sering dari sekali per 24 jam.
- **Dua salinan OpenAPI**: `backend/internal/api/openapi.yaml` (tertanam, dilayani `/api/openapi.yaml`) dan `docs/openapi.yaml` (rujukan). Keduanya sudah berbeda di bagian non-game; ubah bagian game di **keduanya**.
- **Jam pengingat**: ubah `GAME_REMINDER_TIME` di env VPS lalu restart backend; aplikasi memakainya pada sinkron berikutnya. Mengubah kalimat berarti mengubah kode (`REMINDER_MESSAGES`) dan butuh build.
