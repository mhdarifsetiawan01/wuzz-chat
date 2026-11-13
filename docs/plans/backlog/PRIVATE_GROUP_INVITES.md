# Undangan Grup Privat (Wuzz Chat V2, Tahap 1)

> **Status (14 Nov 2026): desain DISETUJUI pengguna (D1-D5 semua sesuai usulan). Backend SELESAI dan DIDEPLOY 14 Nov 2026** (*tes saja* + rute terpasang di produksi; alur nyata belum dicoba). **Mobile SELESAI di kode** (14 Nov 2026, `tsc` lolos, butuh build APK dan uji dua HP; daftar belum teruji di `docs/progress/MOBILE.md`). **Web: landing `/join/<token>` selesai di kode 14 Nov 2026** (dideploy 14 Nov 2026; HTML produksi diperiksa). Aturan yang berlaku kini ada di `docs/domains/GROUP_FORUM.md` aturan 9 dan `docs/BACKEND_API.md` 35c; dokumen ini menyimpan alasan desain. Ini Tahap 1 dari Fase 15 (`docs/ROADMAP.md`) dan rencana Star di `ADS_AND_REWARDS_PLAN.md` bagian 14. Tahap ini **tidak menyentuh uang**: tidak ada Star, Play Billing, atau buku besar. Diputuskan 14 Nov 2026: V2 dimulai dari Tahap 1, sementara Tahap 0 (hukum, merchant, harga) berjalan paralel di sisi pengguna.
> Pemeriksaan terhadap `ADS_AND_REWARDS_PLAN.md` (aturan PROMPT.md no. 9): tidak bertabrakan. Mode gerbang `paid` hanya **dicadangkan** namanya, tidak dibangun.

## 1. Masalah yang diselesaikan

Keadaan kode per 14 Nov 2026 (diperiksa langsung):

| # | Temuan | Lokasi |
|---|---|---|
| K1 | Grup privat `grp_` tidak punya jalur masuk selain ditambahkan admin. Non-anggota yang membuka tautan mendapat 403 dan `AuthorizationShield` (buntu). | `handleGetGroup`, `mobile/src/components/AuthorizationShield.tsx` |
| K2 | Tautan pendek `conversations.short_code` **permanen** dan tidak bisa dicabut; ID `grp_<uuid>` juga permanen. | `store.ShortLinkStore`, `GROUP_FORUM.md` aturan 8 |
| K3 | `POST /api/links` untuk grup privat hanya memeriksa **keanggotaan**. Aturan "grup privat: hanya admin yang membagikan" baru ditegakkan di UI (`GroupInfoScreen.canShareGroup`). | `short_link_handler.go`, `ShortLinkStore.GetOrCreate` |
| K4 | `join-request` / `join-requests` / `action` menolak semua yang bukan `sub_`. Tabel `conversation_join_requests` punya indeks unik `(conversation_id, user_id)`. *Koreksi saat implementasi:* forum sudah mengaktifkan lagi baris yang ditolak (tanpa jeda), jadi pengajuan ulang forum tidak buntu; perilaku forum tidak diubah. | `group_handler.go`, `store/sql.go` |
| K5 | *Koreksi saat implementasi:* forum sudah memberi tahu admin (WS `join_request` + push). Yang belum ada hanya untuk `grp_`, karena jalurnya belum ada. Undangan memakai pola notifikasi yang sama. | `group.ForumService.RequestToJoinSubGroup` |
| K6 | Anggota baru melihat **seluruh** riwayat grup (riwayat hanya dipotong oleh `cleared_at`, bukan `joined_at`). Tidak diubah di tahap ini. | `GetRoomHistoryForUser` |

## 2. Cakupan

**Masuk Tahap 1:**
1. Tautan undangan grup privat berbasis **token rahasia yang bisa dicabut dan direset**.
2. Gerbang masuk lewat tautan: **persetujuan admin**.
3. Pengajuan gabung untuk `grp_` memakai ulang tabel dan alur `conversation_join_requests`.
4. Notifikasi ke admin/creator saat ada pengajuan baru, dan ke pemohon saat diputuskan.
5. Perbaikan K3: tautan untuk grup privat hanya bisa dibuat admin/creator, ditegakkan di server.

**Tidak masuk:** Star, pembayaran, mode `paid`; undangan untuk forum `sub_` (sudah punya alur sendiri); masa berlaku dan batas pemakaian tautan; UI web (web masih dijeda); perubahan riwayat untuk anggota baru (K6).

## 3. Model data

**Tabel baru `group_invite_links`** (riwayat, satu baris per tautan yang pernah dibuat):

| Kolom | Isi |
|---|---|
| `id` | UUID |
| `conversation_id` | `grp_...` (hanya grup utama) |
| `token` | 16 karakter acak dari alfabet tautan pendek (tanpa 0/O/1/l/I), ±93 bit; indeks unik |
| `mode` | `approval` (satu-satunya nilai di Tahap 1; `direct` dan `paid` dicadangkan) |
| `created_by`, `created_at` | pembuat (admin/creator) |
| `revoked_at`, `revoked_by` | diisi saat direset/dimatikan; NULL = aktif |

- **Paling banyak satu tautan aktif per grup**: indeks unik parsial `(conversation_id) WHERE revoked_at IS NULL` (Postgres dan SQLite sama-sama mendukung). Reset = cabut yang lama dan buat yang baru dalam satu transaksi.
- Token disimpan apa adanya (bukan hash) karena admin perlu menampilkan dan membagikannya ulang. Token bukan rahasia tingkat kata sandi: yang dilindunginya adalah hak *mengajukan* gabung, bukan hak masuk.
- Tenant tidak disalin; diturunkan dari `conversations.tenant_id`.

**Perubahan `conversation_join_requests`:**
- Kolom baru `invite_link_id` (nullable): tautan mana yang dipakai pemohon (audit; NULL untuk forum).
- Pengajuan ulang setelah ditolak: baris yang sama di-`UPDATE` kembali ke `pending` (indeks unik tetap), dengan **jeda 24 jam** sejak penolakan (`updated_at`). `created_at` ikut diperbarui agar urutan daftar admin mengikuti pengajuan terbaru. Status baru `cancelled` untuk batal sendiri (tanpa jeda). Hanya berlaku untuk `grp_`; forum tidak diubah (lihat koreksi K4).

## 4. API (semua di belakang `RequireJWT`, tenant harus sama; beda tenant = 404)

| Metode | Path | Siapa | Perilaku |
|---|---|---|---|
| `GET` | `/api/groups/{grp_id}/invite-link` | admin/creator | Tautan aktif atau `{"link": null}` |
| `POST` | `/api/groups/{grp_id}/invite-link` | admin/creator | Buat bila belum ada; body `{"reset": true}` = cabut lalu buat baru. Hanya grup privat (`is_public = false`), selain itu 409 |
| `DELETE` | `/api/groups/{grp_id}/invite-link` | admin/creator | Matikan tautan tanpa pengganti |
| `GET` | `/api/invites/{token}` | pengguna login | Pratinjau: `group_id`, `title`, `avatar_url`, `member_count`, `mode`, `my_status` (`member` / `pending` / `rejected` / `none`), `retry_after` bila ditolak. Token dicabut/tak dikenal = 404 yang **sama** (tidak membedakan "pernah ada") |
| `POST` | `/api/invites/{token}/join` | pengguna login | `approval`: buat/aktifkan pengajuan, 202 `{status:"pending"}`. Idempoten: sudah pending = 202, sudah anggota = 200 `{status:"member"}`, masih dalam jeda = 429 `{code:"rejoin_cooldown", retry_after}` |
| `DELETE` | `/api/invites/{token}/request` | pemohon | Batalkan pengajuan sendiri (dibangun; juga lewat token yang sudah dicabut) |

**Endpoint lama yang diperluas:** `GET /api/groups/{id}/join-requests` dan `POST .../join-requests/{req_id}/action` menerima `grp_` (hanya admin/creator grup itu). Untuk `grp_`, persetujuan memasukkan anggota lewat transaksi yang sama seperti forum, lalu menyiarkan `group_member_joined` ("X bergabung lewat tautan undangan").

**Perbaikan K3:** `POST /api/links` untuk grup privat:
- bukan admin/creator: 403;
- admin/creator: tetap diizinkan (kode lama tetap ada), tetapi mobile baru membagikan tautan undangan untuk grup privat, bukan kode pendek.

Kode pendek yang sudah tersebar tetap diterjemahkan dan tetap berakhir di 403 + shield bagi non-anggota (perilaku sekarang).

**Pembatasan laju (usulan):** `POST /api/invites/{token}/join` 10 per jam per pengguna; `GET /api/invites/{token}` 60 per jam per pengguna; pending per grup maksimal 500 (lebih dari itu 429 `too_many_pending`, menahan spam bila tautan bocor).

**Kenapa tidak ada pratinjau tanpa login:** token yang bocor ke publik tidak membocorkan nama/avatar grup ke perayap. Halaman web `/join/<token>` hanya menampilkan "Buka di aplikasi Wuzz Chat".

## 5. Format tautan

- `https://chat.wuzzhub.id/join/<token>` dan `wuzzchat://join/<token>`.
- Prefiks baru `/join` (bukan di bawah `/g`) dipilih supaya APK lama **tidak** mencegat tautan ini dan salah mengartikannya sebagai ID grup. APK lama membuka browser dan menampilkan halaman "perbarui aplikasi".
- **Butuh build APK baru:** intent filter `pathPrefix: "/join"` di `mobile/app.json`. Dibuild dan diunggah pengguna.
- Web: tambah `/join` ke `WEB_PAUSED_EXEMPT_PREFIXES` dan halaman landing sederhana (butuh deploy frontend).

## 6. Mobile

1. **Pembuka tautan** `/join/<token>`: layar/modal undangan berisi avatar, nama, jumlah anggota, dan tombol "Ajukan Gabung". Statusnya: Menunggu persetujuan / Ditolak (dengan waktu boleh coba lagi) / sudah anggota (langsung buka chat). Tautan tidak valid: "Tautan undangan tidak berlaku lagi".
2. **`GroupInfoScreen` (grup privat, admin/creator):** bagian "Tautan Undangan" dengan Bagikan, Salin, Reset (konfirmasi: "tautan lama berhenti bekerja"), dan Matikan. Tombol "Bagikan" grup privat memakai tautan undangan. Untuk anggota biasa di grup privat tombolnya tetap tersembunyi.
3. **Pengajuan masuk:** pakai ulang `JoinRequestsModal` untuk `grp_`, dibuka dari `GroupInfoScreen` dengan lencana jumlah pending.
4. **Notifikasi:** push dan WS ke admin/creator saat ada pengajuan baru (dibatasi agar tidak membanjiri: gabungkan bila banyak dalam waktu singkat). Ke pemohon saat disetujui (grup muncul di daftar) atau ditolak.
5. Ketahanan jaringan: tombol Ajukan bersifat idempoten di server, jadi aman untuk dicoba ulang setelah timeout; status ditampilkan dari jawaban server, bukan diasumsikan.

## 7. Kasus tepi

- **Grup diubah dari privat ke publik:** tautan undangan dicabut otomatis; pending yang ada tetap bisa diputuskan admin.
- **Tautan direset/dimatikan:** pengajuan pending yang sudah masuk **tetap** ada (admin yang memutuskan). Pengajuan baru lewat token lama ditolak 404.
- **Anggota yang dikeluarkan admin** dapat mengajukan lagi lewat tautan, dan admin bisa menolaknya (mode `approval` menjamin admin selalu memutuskan).
- **Admin diturunkan perannya:** tautan tetap aktif (milik grup, bukan milik pembuatnya).
- **Akun pemohon dibekukan/ditangguhkan/dihapus:** gerbang auth yang ada menolak permintaannya; baris pending milik akun terhapus dibersihkan oleh penghapus akun (perlu dicek saat implementasi).
- **Beda tenant:** pratinjau dan join menjawab 404.

## 8. Pengujian (saat implementasi)

- Store: tes SQLite dan Postgres 16 sementara (`PG_TEST_ADMIN_DSN`) untuk satu-tautan-aktif, reset atomik, jeda pengajuan ulang, dan persetujuan `grp_`.
- Handler: otorisasi (anggota biasa tidak bisa membuat/melihat tautan; K3), 404 seragam, idempoten, laju, tenant.
- Mobile: `npx tsc --noEmit`. Uji nyata dua HP oleh pengguna setelah build.

## 9. Keputusan (semua disetujui pengguna 14 Nov 2026)

| # | Pertanyaan | Usulan |
|---|---|---|
| D1 | Mode tautan di Tahap 1 | Hanya persetujuan admin. `direct` (langsung masuk) ditunda: lebih banyak kasus tepi (anggota yang dikeluarkan masuk lagi) |
| D2 | Isi pratinjau sebelum bergabung | Nama, avatar, jumlah anggota; tanpa deskripsi dan daftar anggota; wajib login |
| D3 | Jeda pengajuan ulang setelah ditolak | 24 jam |
| D4 | Riwayat untuk anggota baru | Tetap seperti sekarang (lihat semua) |
| D5 | Batas pending per grup | 500 |

Pertanyaan uang (sekali bayar vs langganan, pasar, persen platform) baru dibutuhkan di Tahap 2.

## 10. Urutan kerja setelah disetujui

Implementasi backend (14 Nov 2026): `store/invite_links.go`, `group/invite_service.go`, `api/group_invite_handler.go`, rute di `app/router.go`, perakitan di `app/wire.go`. Kode galat: `invite_not_found`, `admin_only`, `not_private`, `rejoin_cooldown`, `too_many_pending`, `request_not_found`, `request_processed`. Ikut diperbaiki: bug pola kode pendek yang menolak huruf `i` (backend, web, mobile).

1. **[SELESAI 14 Nov 2026, tes saja]** Backend: tabel dan migrasi, store, service, handler, laju, notifikasi, perbaikan K3, tes.
2. **[SELESAI 14 Nov 2026]** Dokumen: `GROUP_FORUM.md` (aturan 6, bagian 6 backlog), kedua OpenAPI, `BACKEND_API.md`, `ARCHITECTURE.md` (tabel baru), progres.
3. **[SELESAI 14 Nov 2026, tes saja]** Mobile: pembuka tautan, layar undangan, bagian admin, lembar pengajuan, intent filter.
4. **[SELESAI 14 Nov 2026, tes saja]** Frontend: pengecualian gerbang dan landing `/join` (`frontend/app/join/[token]/page.tsx`).
5. Pengguna: deploy backend, deploy frontend, build APK baru, uji dua HP. Urutan aman: backend dulu (endpoint baru tidak dipakai APK lama), lalu APK.
