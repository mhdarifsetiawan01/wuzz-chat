# TURN_SETUP.md — coturn untuk Panggilan Suara

Panggilan suara memakai WebRTC P2P. Di WiFi dengan *client isolation* (HP tidak bisa saling ping) atau di balik NAT ketat,
jalur langsung gagal dan **semua suara wajib lewat server TURN**. Tanpa TURN yang sehat, panggilan "tersambung" (sinyal jalan)
tetapi sunyi. Aplikasi mengambil kredensial sementara dari `GET /api/calls/ice-servers` (rahasia coturn tidak pernah masuk APK).

## Kapasitas & risiko (VPS 2 vCPU, 2 GB RAM, 500 GB/bulan)
- Satu menit panggilan relay ≈ 0,7 MB keluar dari VPS (≈1,4 MB bila penyedia menghitung masuk+keluar) → ±370 ribu–700 ribu menit/bulan.
- Risiko utama: TURN terbuka disalahgunakan jadi relay gratis. Mitigasi di konfigurasi: kredensial sementara (TTL 10 menit),
  `denied-peer-ip` untuk semua alamat privat, kuota per pengguna, rentang port relay sempit, batas CPU/RAM Docker.

Penguatan: `no-tcp-relay` menutup relay TCP RFC 6062 (bawaan coturn mengizinkannya; bisa dipakai menyambung ke host sembarang).
`max-bps` (byte/detik per sesi, arah masuk dan keluar dihitung terpisah) dan `bps-capacity` (total server) membatasi penyalahgunaan bandwidth
oleh akun terdaftar (registrasi terbuka). Suara lewat relay ±5 KB/s per arah, jadi 60 KB/s memberi ruang 12×.
Endpoint `/api/calls/ice-servers` dibatasi 20 permintaan/menit per pengguna.

## 1. Rahasia
```bash
openssl rand -hex 32   # simpan sebagai TURN_SECRET (sama di coturn dan backend)
```

## 2. coturn (di VPS, Docker, jaringan host)
`~/coturn/turnserver.conf` (ganti `<SECRET>`; `10.11.22.25` = IP privat eth0 VPS):
```
listening-port=3478
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=<SECRET>
realm=chat.wuzzhub.id
no-tls
no-dtls
no-cli
no-multicast-peers
min-port=49152
max-port=49252
external-ip=43.157.227.115/10.11.22.25
user-quota=12
total-quota=100
no-tcp-relay
max-bps=60000
bps-capacity=6000000
stale-nonce=600
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.0.0.0-192.0.0.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=198.18.0.0-198.19.255.255
```
`~/coturn/docker-compose.yml`:
```yaml
services:
  coturn:
    image: coturn/coturn:latest
    container_name: wuzz-coturn
    network_mode: host
    restart: unless-stopped
    command: ["-c", "/etc/coturn/turnserver.conf"]
    volumes:
      - ./turnserver.conf:/etc/coturn/turnserver.conf:ro
    mem_limit: 256m
    cpus: 1.0
```
Izin berkas: `chmod 700 ~/coturn && chmod 644 ~/coturn/turnserver.conf` (proses di container bukan root; berkas 600 milik `deploy`
tidak terbaca → coturn diam-diam memakai pengaturan bawaan: tanpa autentikasi, tanpa `external-ip`, tanpa `denied-peer-ip`).
Direktori 700 mencegah pengguna lokal lain membaca rahasia di dalamnya.

Jalankan: `cd ~/coturn && docker compose up -d`.

**Wajib diverifikasi setelah start** (kedua jebakan di atas tidak terlihat dari status container):
```bash
docker logs wuzz-coturn 2>&1 | grep -i "Cannot find config"   # TIDAK boleh ada hasil
```
Lalu uji dari luar: Allocate **tanpa kredensial** harus ditolak (respons `0x0113`, bukan `0x0103`), dan kandidat relay harus berisi IP **publik**
(`43.157.227.115`) dengan port 49152–49252, bukan IP privat `10.11.22.25`.

## 3. Firewall
Panel VPS **dan** UFW, TCP/UDP 3478 dan UDP 49152–49252 dari `0.0.0.0/0`:
```bash
sudo ufw allow 3478/udp && sudo ufw allow 3478/tcp && sudo ufw allow 49152:49252/udp
```
(5349/TLS dan TCP 443 ditunda; lihat risiko bentrok dengan nginx.)

## 4. Backend
Tambah ke env VPS lalu deploy (`ssh wuzz-vps ./deploy-chat.sh`):
```
TURN_SECRET=<SECRET>
TURN_URLS=turn:43.157.227.115:3478?transport=udp,turn:43.157.227.115:3478?transport=tcp
```
Cek: `GET https://chat-api.wuzzhub.id/api/calls/ice-servers` (dengan JWT) harus memuat entri `turn:` + `username` + `credential`.

## 5. Uji
Dari laptop (sebelum menyalahkan aplikasi): ambil kredensial dari endpoint di atas lalu uji dengan klien TURN (mis. `aioice`)
dan pastikan ada kandidat `typ relay`. Lalu uji panggilan dua HP di WiFi dengan client isolation dan ukur `/proc/net/dev`
`wlan0` selama panggilan (harus ±3–6 KB/s per arah bila relay berjalan).

---

## 6. Kapasitas, Skalabilitas & Jalur Upgrade (BACA SEBELUM PENGGUNA BERTAMBAH)

> Status per 5 Okt 2026: **belum pernah diuji beban.** Semua angka di bawah adalah perkiraan. Ukur dulu (bagian 6.4) sebelum
> mengambil keputusan mahal. Hal yang tidak diketahui saat dokumen ini ditulis: kecepatan port VPS, dan apakah penyedia
> menghitung bandwidth masuk+keluar atau hanya keluar.

### 6.1 Batas saat ini (di `~/coturn/turnserver.conf` pada VPS)
| Opsi | Nilai | Arti | Dampak bila terlewati |
|---|---|---|---|
| `total-quota` | 100 | maks alokasi bersamaan = ±**50 panggilan relay** (2 alokasi per panggilan) | alokasi baru ditolak (error 486) -> UI panggilan "Koneksi audio gagal" |
| `user-quota` | 12 | alokasi per username (satu userID) | sesi ke-13 satu akun ditolak |
| `max-bps` | 60000 | byte/detik per sesi, arah masuk & keluar terpisah | paket di atas batas di-drop/ditunda (suara terputus-putus) |
| `bps-capacity` | 6000000 | total byte/detik semua sesi | sesi baru ditolak bila kapasitas habis |
| `no-tcp-relay` | aktif | relay TCP (RFC 6062) dimatikan | - (hanya relay UDP; cukup untuk audio WebRTC) |

Batas **sengaja konservatif** (anti-penyalahgunaan; registrasi terbuka). Menaikkannya: edit berkas, `docker compose restart`, lalu **ulangi verifikasi
bagian 2** (log "Cannot find config" harus kosong, Allocate tanpa kredensial ditolak, kandidat relay berisi IP publik).

### 6.2 Perkiraan beban (asumsi: ±30% panggilan butuh relay, ±20 KB/s di VPS per panggilan relay)
Relay bisa 20-50% di Indonesia (CGNAT operator seluler, WiFi dengan *client isolation*). Satu menit panggilan relay ≈ 0,7 MB keluar dari VPS.

| Panggilan bersamaan | Relay | Alokasi | Lalu lintas VPS | Tindakan |
|---|---|---|---|---|
| 100 | 30 | 60 | ±5 Mbps | aman dengan konfigurasi sekarang |
| 500 | 150 | 300 | ±24 Mbps | naikkan `total-quota` (>= alokasi x 1,5) dan `bps-capacity` |
| 1.000 | 300 | 600 | ±48 Mbps | CPU 2 vCPU mulai ketat (perkiraan 50-80%); pantau |
| 3.000+ | 900 | 1.800 | ±150 Mbps | pindah ke server TURN terpisah/lebih besar (6.5) |

Rumus cepat: `alokasi = panggilan x rasio_relay x 2`, `Mbps ≈ panggilan x rasio_relay x 0,16`.
Kuota 500 GB/bulan ≈ 700 ribu menit relay ≈ 2-3 juta menit panggilan total (rasio 30%). "Ribuan anggota" biasanya hanya 1-5% yang menelepon bersamaan.

### 6.3 Pemantauan minimum (belum ada otomatis; lakukan manual atau pasang alarm)
- Alokasi/penggunaan: `docker logs wuzz-coturn 2>&1 | grep -c "allocation new"` (naikkan `verbose` sementara untuk log sesi; **matikan lagi**, log verbose memuat IP dan userID).
- Beban host: `docker stats --no-stream wuzz-coturn wuzz-backend`, `uptime`, `free -m`.
- Bandwidth bulanan: panel penyedia VPS atau `vnstat` (belum terpasang). **Beri alarm di 70% kuota 500 GB.**
- Lonjakan `Koneksi audio gagal`: tanda `total-quota`/`bps-capacity` tercapai. coturn punya endpoint Prometheus (`prometheus` di konfigurasi, port 9641); belum dipakai.
- Cek berkala dari luar: Allocate tanpa kredensial harus ditolak (`0x0113`).

### 6.4 Uji beban (lakukan di jam sepi, butuh izin pemilik server)
1. Buat N pasang kredensial sementara di VPS (`openssl dgst -sha1 -hmac $(cat ~/coturn/.secret)`, username `<epoch+600>:loadtest-<i>`).
2. Dari laptop jalankan N pasang klien `aioice` yang hanya memakai kandidat relay dan saling kirim paket ±50 pps x 100 byte (meniru Opus), lihat `docs/TURN_SETUP.md` bagian 5.
3. Naikkan N bertahap (10, 25, 50, 100 pasang) sambil memantau `docker stats`, `uptime`, dan bandwidth `eth0`.
4. Catat N saat CPU > 70% atau paket mulai hilang; itu batas praktis VPS ini. Perbarui tabel 6.2 dengan angka nyata.
Jangan menguji dengan pengguna sungguhan; jangan lupa menghapus kredensial/skrip uji.

### 6.5 Jalur upgrade (urutan murah -> mahal)
1. **Naikkan kuota** (6.1) bila alokasi mendekati 70% batas dan CPU/bandwidth masih longgar.
2. **TURN di VPS terpisah** (disarankan sebelum ±500 panggilan bersamaan): pasang `coturn` dengan langkah bagian 1-3 di server baru, **rahasia `static-auth-secret` yang sama**
   atau berbeda per server (backend hanya menerbitkan satu `TURN_SECRET`; bila berbeda per server, ubah `IceHandler` agar menerbitkan kredensial per server).
   Ubah `TURN_URLS` di `.env` backend ke IP server baru, deploy backend. Backend dan WebSocket tidak lagi berebut CPU dengan relay.
3. **Beberapa server TURN**: `TURN_URLS` menerima daftar dipisah koma; klien WebRTC mencoba semuanya, jadi menambah URL memberi cadangan sekaligus pembagian beban.
   Penyebaran geografis (server dekat pengguna) menurunkan latensi suara.
4. **Jaringan ketat**: sebagian WiFi/operator memblokir UDP non-standar. Tambahkan TURN di TCP/TLS 443 (butuh domain, sertifikat Let's Encrypt, dan port 443 yang bebas di server TURN terpisah, bukan di VPS ini karena bentrok dengan nginx). Aktifkan `tls-listening-port`, `cert`, `pkey` dan tambahkan `turns:` ke `TURN_URLS`.
5. **Lebih dari ±3.000 panggilan bersamaan**: pertimbangkan layanan TURN terkelola (mis. metered.ca/Cloudflare) sebagai cadangan atau pengganti; kredensial tetap disalurkan lewat `/api/calls/ice-servers` agar APK tidak perlu diubah.

### 6.6 Hal lain yang ikut menentukan skala panggilan
- **Backend & WebSocket** berbagi 2 vCPU/2 GB RAM dengan relay. Ribuan koneksi WebSocket bersamaan perlu uji tersendiri (`load-test/`), dan Redis Pub/Sub dipakai untuk multi-node.
- **Satu titik gagal**: VPS dan `coturn` yang sama. Tanpa cadangan, VPS mati = semua panggilan relay mati.
- **Belum ada ICE restart** dan **belum ada foreground service mikrofon** di aplikasi: panggilan bisa putus bila jaringan berpindah atau layar mati (lihat `docs/domains/WEBRTC_CALLING.md`). Foreground service mikrofon memerlukan deklarasi Foreground Service di Play Console.
- **Rotasi rahasia**: ganti `TURN_SECRET` di `.env` backend **dan** `static-auth-secret` di coturn bersamaan, restart keduanya; kredensial lama (TTL 10 menit) berhenti bekerja.

### 6.7 Pelajaran insiden (jangan diulang)
Pada 5 Okt 2026 coturn sempat ±3,5 menit berjalan **tanpa autentikasi, tanpa `external-ip`, tanpa `denied-peer-ip`** karena `turnserver.conf` berizin 600 tidak terbaca proses container
(coturn diam-diam memakai pengaturan bawaan) dan `use-auth-secret` tanpa `lt-cred-mech` tidak mewajibkan auth. Setiap perubahan konfigurasi wajib diverifikasi ulang (bagian 2).

