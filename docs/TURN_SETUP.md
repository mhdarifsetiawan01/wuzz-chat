# TURN_SETUP.md — coturn untuk Panggilan Suara

Panggilan suara memakai WebRTC P2P. Di WiFi dengan *client isolation* (HP tidak bisa saling ping) atau di balik NAT ketat,
jalur langsung gagal dan **semua suara wajib lewat server TURN**. Tanpa TURN yang sehat, panggilan "tersambung" (sinyal jalan)
tetapi sunyi. Aplikasi mengambil kredensial sementara dari `GET /api/calls/ice-servers` (rahasia coturn tidak pernah masuk APK).

## Kapasitas & risiko (VPS 2 vCPU, 2 GB RAM, 500 GB/bulan)
- Satu menit panggilan relay ≈ 0,7 MB keluar dari VPS (≈1,4 MB bila penyedia menghitung masuk+keluar) → ±370 ribu–700 ribu menit/bulan.
- Risiko utama: TURN terbuka disalahgunakan jadi relay gratis. Mitigasi di konfigurasi: kredensial sementara (TTL 10 menit),
  `denied-peer-ip` untuk semua alamat privat, kuota per pengguna, rentang port relay sempit, batas CPU/RAM Docker.

## 1. Rahasia
```bash
openssl rand -hex 32   # simpan sebagai TURN_SECRET (sama di coturn dan backend)
```

## 2. coturn (di VPS, Docker, jaringan host)
`~/coturn/turnserver.conf` (ganti `<SECRET>`; `10.11.22.25` = IP privat eth0 VPS):
```
listening-port=3478
fingerprint
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
Jalankan: `cd ~/coturn && docker compose up -d` lalu `docker logs wuzz-coturn | tail`.

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
