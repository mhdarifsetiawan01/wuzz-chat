# B2B Widget Customer Service — Rencana (Backlog)

> Status: **diskusi, belum dikerjakan** (dicatat 5 Okt 2026). Dokumen ini hanya bahan diskusi lanjutan.
> Prasyarat: audit isolasi tenant T1–T6 sudah selesai (lihat [`docs/progress/MULTI_TENANT.md`](../../../progress/MULTI_TENANT.md)).

## Tujuan
Klien (bisnis lain) memasang chat customer service di web mereka. Pengunjung chat dengan tim klien lewat widget, agen membalas dari dashboard. Wuzz Chat menjadi mesin di belakangnya.

Ini bentuk produk yang berbeda dari chat sekarang: **pengunjung ke tim** (inbox bersama, status, penanggung jawab), bukan user ke user.

## Keputusan yang sudah disepakati
- **Integrasi tingkat 1–2**:
  1. Snippet satu baris: `<script src=".../widget.js" data-site-key="pk_..." async></script>`, pengunjung anonim.
  2. Snippet + identitas: server klien memakai provisioning B2B yang sudah ada, sehingga agen melihat identitas pelanggan asli.
  - Plugin siap pakai (WordPress, Shopify, dll) dan SDK mobile **ditunda** sampai ada permintaan nyata.
- **Data**: pola 1 (DB bersama + `tenant_id`) dan pola 4 (sinkron ke sistem klien lewat webhook/API ekspor).
  - DB terpisah per tenant hanya untuk kebutuhan enterprise/kepatuhan di masa depan.
  - Database milik klien (BYODB) **tidak** dipakai: risiko keandalan, keamanan, dan dukungan lebih besar dari manfaatnya.

## Arsitektur yang direkomendasikan
- Tipe percakapan baru **`support`**: tenant, pengunjung, agen penanggung jawab, status (open/pending/closed).
- Widget berupa **iframe dari domain kita** + `loader.js` kecil di web klien (isolasi CSS/JS).
- Pengunjung tamu: token terikat ke browser dan hanya berlaku untuk satu percakapan; bisa di-upgrade lewat provisioning.
- Sisi agen: **web inbox** di Next.js yang sudah ada, role `agent` dan `admin` per tenant. Mobile agen belakangan.
- Routing awal sederhana: satu inbox bersama, claim/assign. Skill routing, SLA, jam kerja ditunda.
- **Tanpa E2EE** untuk percakapan support (agen, AI, riwayat, dan pencarian butuh akses isi pesan). Harus dijelaskan ke klien.

## Syarat keamanan
- Public **site key** per tenant (bukan `App-Secret`, karena terlihat di browser).
- **Allowed origins per tenant** (CORS sekarang masih global).
- Anti-spam tamu: rate limit per IP dan per tenant, batas lampiran, opsi captcha.
- Kuota per tenant (dasar penagihan) dan kebijakan retensi transkrip.
- Aturan isolasi yang sudah ada tetap berlaku (header tenant harus sama dengan JWT, dst).

## Usulan potongan MVP
1. Model data `support` + site key + allowed origins + endpoint admin tenant/API key.
2. Alur tamu + widget iframe (teks dan lampiran).
3. Web inbox agen (daftar, balas, claim, tutup).
4. Notifikasi agen offline (email/push) dan transkrip.
5. Webhook keluar + API ekspor (pola 4).
6. Lanjutan: upgrade identitas via provisioning, AI saran balasan/ringkasan (memakai mesin memory).

## Belum diputuskan (bahan diskusi berikutnya)
- Target pengguna pertama: web sendiri, bisnis kenalan, atau dijual terbuka? (menentukan kedalaman admin, penagihan, onboarding self-service)
- Pengunjung anonim sejak MVP, atau hanya yang teridentifikasi dulu?
- Agen cukup web inbox, atau mobile sejak awal?
- AI ikut MVP? (saran balasan/ringkasan vs auto-reply penuh yang risikonya berbeda)
- Model harga dan kuota.

## Sisa pekerjaan multi-tenant yang terkait
Belum ada: endpoint admin tenant/API key, allowed-origin per tenant, webhook keluar. Sisa audit keamanan (jalur baca `memory_store`, `push`, `transfer_store`, SSRF `link_preview`, endpoint media, Redis cluster) sebaiknya dituntaskan sebelum tenant eksternal masuk.
