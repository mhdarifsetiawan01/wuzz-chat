# Backlog: Performa, Penyimpanan & Keamanan Data Lokal Mobile

> Dibuat 2026-10-04 di akhir sesi optimasi mobile. Berisi pekerjaan yang **belum** dikerjakan beserta data terukur,
> cara memverifikasi, dan keputusan yang masih menunggu. Yang sudah selesai dicatat di bagian "Sudah selesai" sebagai
> rujukan. Semua angka diukur di HP uji (RMX3506, 720x1600) kecuali disebut lain.

## Status Git (baca dulu)
- Branch kerja `dev`. **11 commit mobile belum masuk `main`** dan keputusan merge (A: merge+push, B: merge lokal, C: tetap di `dev`) **ditunda** (dipilih C setiap kali). Tidak ada `push` yang pernah dilakukan.
- Aturan proyek (`PROMPT.md`): jangan `git commit` sebelum pengguna menyatakan "selesai"; jangan `git push` tanpa izin tertulis; build release dilakukan pengguna sendiri.

## Sudah selesai (rujukan, urut commit)
| Commit | Isi | Hasil terukur |
|---|---|---|
| `a0a4875` | `React.memo` bubble & baris chat, tuning FlatList, `expo-image`, hapus `console.log` di release | Scroll chat jank median ±1–3% (sebelumnya ±7% pada sampel tunggal) |
| `a9b173f` | Hapus `transition` fade gambar | Tidak terbukti membantu; hanya kosmetik |
| `3785594` | `mobile/scripts/measure-scroll.js` (benchmark scroll via adb, median 10 run) | Alat ukur |
| `d1d4628` | Pecah `MessageContext` ke `messageStore.ts` + `useRoomMessages`/`useMessageActions` | Tidak ada regresi scroll |
| `60b2f7f` | Pruning SQLite benar (VACUUM sekali untuk DB lama, `execAsync` untuk `incremental_vacuum`) + antrean tulis `exclusiveQueue.ts` | Peringatan transaksi bersarang hilang |
| `cd95c33` | `roomKeyStore.ts`: kunci AES room disimpan di SecureStore | ECDH ±120 ms/room: cold start ke-2 dan seterusnya 0 derivasi |
| `2b8f69d` | Kompresi `.so` hanya untuk `assembleRelease`, AAB tidak | APK arm64 52,5 → 29,2 MB (ruang terpakai di HP 51,3 → 65,9 MB) |
| `be0ad79` | Tampilan jujur "Pesan tidak dapat dibuka" + kontras kutipan balasan | Kontras kutipan 1,2:1 → 5,3:1 |
| `3ed8d51` | Peringatan konsekuensi di dialog reset kunci | — |
| `36e424c` | Layar Penyimpanan jujur + WAL dibatasi + pembersih cache aman | DB 328 KB tampil vs ±4,5 MB nyata; WAL 4,17 MB → ±0 |
| `60ce534` | `reconcileHistory`: berhenti rekonsiliasi 4x, tulis hanya yang berubah | Buka 4 chat: +1,72 MB → +261 KB; 460 → 0 baris pesan |

## Prioritas A — Dampak nyata, risiko rendah
| # | Pekerjaan | Catatan |
|---|---|---|
| A1 | **`saveStoredConversations`: tulis hanya yang berubah** — ✅ KODE SELESAI (belum dikomit, **belum diukur di HP**) | Tanda tangan kanonik per percakapan (`persistedConversationSignatures`, diisi di `getStoredConversations`, dicatat setelah commit, dilupakan oleh `updateStoredConversationPin/Unread` dan `clearUserCache`) + UPSERT. Dua penulisan cold start berasal dari `refreshConversations` dan efek re-proses setelah kunci E2EE siap (`ConversationContext.tsx` ±443); keduanya kini tidak menulis bila isi sama. Uji: `sqlite-conversations.test.js` (10 skenario). **Sisa:** ukur di HP dengan prosedur baku, target pertumbuhan < 50 KB (sebelumnya +261 KB). |
| A2 | **Simpan pembaruan WebSocket (receipt, reaksi, edit, pin, hapus) ke SQLite** | `updateMessage`/ACK/receipt hanya mengubah memori; SQLite baru menyusul pada rekonsiliasi riwayat berikutnya. Sekarang penulisan murah (hanya yang berubah), jadi write-through per event layak. **Perlu keputusan:** apakah ketertinggalan sesaat setelah cold start (status/reaksi usang ±1 dtk) cukup diterima. |
| A3 | **Uji nada dering setelah cache dibersihkan (panggilan nyata)** | Bug diperbaiki di `callAudioManager` (kini memeriksa ulang `wuzz_*.wav`) dan terbukti berkas selamat (sisa cache 54,8 KB = dua `.wav`), tapi bunyi nada belum diuji. Butuh akun/perangkat kedua. |
| A4 | **Bangun AAB sungguhan (`./gradlew bundleRelease`)** | Hanya `--dry-run` yang pernah dijalankan untuk jalur ini. Pastikan: `.so` TIDAK dikompres, satu berkas `app-release.aab`, ukuran sebenarnya. Angka "~50 MB" di `MOBILE.md` tercatat lama (belum diukur ulang setelah `expo-image`). |

## Prioritas B — Keputusan produk / keamanan
| # | Pekerjaan | Catatan |
|---|---|---|
| B1 | **Nasib `clearUserCache`** | Diekspor dan berkomentar "dipakai saat logout", tetapi **tidak dipanggil dari mana pun**. Logout biasa meninggalkan pesan (plaintext, SQLite tak terenkripsi), percakapan, log panggilan, dan media persisten di HP. Kunci E2EE sengaja dipertahankan (Trusted Device). **Putuskan:** apa yang dihapus saat logout biasa vs "keluar & hapus data"? Kunci turunan room (`wuzz_e2ee_aes_*`) ikut terhapus bersama kunci E2EE, bukan saat logout biasa. |
| B2 | **Kunci cache memori memakai 32 karakter pertama JWK peer** — ✅ KODE SELESAI (belum dikomit) | `roomKeyCacheId` kini memakai kunci privat, JWK peer, dan roomId LENGKAP (bukan `roomKeyFingerprint`: cache hanya di memori, kunci privat sudah ada di sana, dan tanpa biaya SHA-256 per dekripsi). Uji `crypto-cache.test.js` gagal pada kode lama, lulus pada kode baru. |
| B3 | **Pencegahan kehilangan kunci (opsional)** | Pemulihan pesan 2 Okt **ditutup** (tidak ada perangkat lain yang menyimpan kunci lama; lihat memori `e2ee-old-messages-locked-key-reset`). Pencegahan ke depan: arsipkan kunci privat lama pada reset DI TEMPAT (tidak menolong kasus uninstall karena SecureStore ikut hilang), dan perluas transfer QR agar membawa kunci lama. Hanya layak bila ada kebutuhan nyata; perlu keputusan keamanan (kunci lama sama sensitifnya dengan kunci utama). Catatan DEC-015: penanda "tidak bisa dibuka" tersimpan sebagai isi pesan sehingga tidak dicoba didekripsi ulang. |

## Prioritas C — Verifikasi & dokumentasi yang tertunda
| # | Pekerjaan | Cara memverifikasi |
|---|---|---|
| C1 | Varian kutipan balasan di **bubble gelap** (pesan lawan) | Minta lawan membalas sebuah pesan; screenshot. Hitungan: 9,7:1. |
| C2 | Kalimat baru langkah 2 dialog reset ("tekan Kembali lalu pilih Transfer...") | Hanya muncul saat konflik kunci (HTTP 409). Aman: pasang instance inert sementara di `App.tsx` (ditandai `PRATINJAU-SEMENTARA`, handler kosong, tidak memanggil `resetE2EEKeys`), lalu `git checkout -- mobile/App.tsx`. |
| C3 | Perubahan status pada pesan yang sudah ada saat riwayat dimuat ulang (delivered → read) | Baca pesan dari perangkat lawan lalu buka chat; hanya teruji lewat database tiruan (satu pesan berubah menulis satu baris). |
| C4 | `mobile/DESIGN.md` bagian 7A usang | Menyebut bubble masuk berlatar putih (`bgSurface`), kodenya gelap (`#334155`). Periksa bagian lain yang mungkin usang. |
| C5 | Tombol "Bersihkan Cache Pesan" di layar Penyimpanan | Belum diuji di HP (hanya "Bersihkan Cache Gambar" yang dicoba). Hapus riwayat lokal; pesan harus kembali dari server. Cek juga sinkron dengan cache tanda tangan penulisan. |

## Prioritas D — Optimasi lanjutan (opsional)
| # | Pekerjaan | Catatan |
|---|---|---|
| D1 | **Pecah `ChatScreen.tsx` (±2.400 baris)** | Sisa rekomendasi awal "paket 5". State input yang berubah per ketukan merender seluruh layar. Ukur dulu dengan React DevTools Profiler / `measure-scroll.js` sebelum dan sesudah. |
| D2 | **Ukuran APK: pemindai QR ML Kit** | `libbarhopper_v3.so` 4,95 MB (dari kamera, dipakai transfer kunci QR). Alternatif lebih ringan bisa hemat 3–5 MB tetapi berisiko pada fitur transfer kunci; riset dulu. WebRTC (11,4 MB) dan inti RN/Hermes (9,5 MB) tidak bisa dipangkas. Lazy-load JS tidak mengecilkan APK (bundle JS hanya 3,1 MB). |
| D3 | **`reconcileHistory` membuang halaman lama di memori** | Dari membaca kode (belum dikonfirmasi di perangkat): hasil rekonsiliasi = jendela server + pesan optimistic, sehingga halaman lama hasil paginasi (`loadOlderMessages`) hilang dari memori tiap event `history`. Periksa apakah terlihat sebagai daftar yang "menyusut" setelah reconnect. |
| D4 | **Rejoin room setelah WebSocket terputus** | `websocket.ts` tidak otomatis rejoin saat reconnect. `ChatScreen` hanya punya SATU percobaan ulang join, dan sekarang (`retried = joined`) hanya terpakai bila join pertama gagal. Sebelum perbaikan pun celah ini ada (percobaan sekali pakai itu habis oleh pemanggilan seketika `onStateChange`), jadi bukan regresi. Periksa apakah chat yang sedang terbuka tetap menerima pesan setelah koneksi putus lalu tersambung lagi; bila tidak, rejoin pada setiap transisi ke `connected` setelah pemanggilan awal. |
| D5 | **Cache Fresco `image_cache` (0,98 MB) dan `http-cache` (0,34 MB)** | Pemilik tidak diketahui; ikut terhapus oleh pembersih (kecuali `image_manager_disk_cache` milik expo-image yang dibersihkan lewat API). Investigasi bila ingin akuntansi lebih rinci. |
| D6 | **Dekripsi AES per pesan** | Tidak terukur di HP (estimasi ±1 ms/pesan dari rasio Node). Hanya ukur bila riwayat panjang terasa lambat. |

## Metode & alat yang terbukti (jangan ulang dari nol)
- **Ukur dulu, baru perbaiki.** Beberapa dugaan awal terbukti salah (mis. "AES per pesan lambat", "media persisten besar", "`getInfoAsync` tak menghitung folder"). Probe sementara dipasang sebagai `console.warn` bertanda **`PROBE-SEMENTARA`** (level warn agar lolos Babel di release; `console.log` dibuang), dibaca lewat `adb logcat`, lalu **dihapus sebelum commit** (`grep -rc PROBE-SEMENTARA mobile/` harus 0).
- **Benchmark scroll:** `node mobile/scripts/measure-scroll.js --runs 10 --label ... --screenshot f.png` (median; buka layar yang diukur dulu; HP sering berisik karena RAM sempit, jadi pakai median, bukan satu run).
- **Alat ukur penulisan SQLite tanpa probe:** layar Pengaturan → Kelola Penyimpanan (baris Database Lokal kini menyertakan WAL). Prosedur baku: cold start, tunggu 30 dtk (maintenance memangkas WAL), buka layar, buka 4 chat (Semantic, Bacot Rumpi, Gh-Jev, Surotong) lalu kembali tiap kali, buka layar lagi, bandingkan.
- **Skrip uji sudah tersimpan di repo (tidak perlu ditulis ulang):**
  - `npm run test:unit` di `mobile/` menjalankan semua `mobile/scripts/test/*.test.js` (5 berkas, tanpa HP/emulator): `sqlite-storage` (10 skenario penulisan pesan dengan database tiruan; **jadikan acuan untuk A1**), `room-key-store` (9 skenario kunci AES room), `exclusive-queue`, `message-store`, `undecryptable`. Harness bersama `_harness.js` mentranspile modul `src/` ASLI dan mengganti modul native dengan tiruan; objek `p256` noble beku, jadi ECDH dihitung lewat penanda yang disisipkan saat transpile (`tapEcdh`).
  - `mobile/scripts/sandbox/*.py` (Python `sqlite3`) membuktikan perilaku SQLite sebelum menulis kode: `sqlite_wal_behavior.py` (WAL 4,21 MB tereproduksi), `sqlite_write_cost.py` (INSERT OR REPLACE vs UPSERT vs hanya yang berubah; **ganti skema/baris di `make()` untuk `local_conversations` pada A1**), `sqlite_auto_vacuum.py` (DB lama tidak menyusut; `incremental_vacuum` per langkah).
- **Navigasi adb (layar 720x1600):** tab Pengaturan `(599,1520)`, tab Obrolan `(122,1520)`; baris daftar chat y = 710 / 875 / 1040 / 1370; ketukan pertama setelah scroll sering tidak masuk (ketuk ulang dan verifikasi dengan screenshot); gunakan `am start -n com.wuzzchat.mobile/.MainActivity`; HP harus tidak terkunci (jangan coba membuka kunci).
- **Build:** pengguna sendiri, `./gradlew assembleRelease -PskipSmartBump` di `mobile/android` (keystore via env `WUZZ_*`, password tidak lewat Claude). `mobile/android/` hasil generate dan diabaikan git; perubahan native lewat `app.json` / `mobile/plugins/`. Perubahan JS saja tidak butuh build native ulang (Gradle memakai ulang hasil kompilasi).
- **Jangan:** memicu konflik kunci E2EE atau reset kunci di akun nyata; memindai QR transfer dari perangkat lama (mengganti kunci utama); menekan "Bersihkan Cache Pesan" tanpa tujuan jelas.

## Cara melanjutkan besok
1. Putuskan merge ke `main` (A/B/C) atau lanjut dulu di `dev`.
2. Mulai dari **A1** (`saveStoredConversations`): pasang probe `PROBE-SEMENTARA` di fungsinya, ukur dengan prosedur baku, kerjakan, tambahkan skenario ke uji (`sqlite-storage.test.js` sebagai pola), ukur ulang di HP, hapus probe. Jalankan `npm run test:unit` dan `npx tsc --noEmit` sebelum minta build.
3. Selesaikan keputusan **A2** dan **B1** (butuh jawaban Anda), lalu B2 (kecil).
4. Konfirmasi verifikasi **C1–C5** bila ada kesempatan (beberapa butuh perangkat/akun kedua).
