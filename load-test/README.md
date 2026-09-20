# Wuzz Chat — Load Test Suite

Panduan menjalankan load test terhadap server production `wuzz-chat-backend.fly.dev`.

---

## Persiapan

### 1. Pastikan k6 sudah terinstall
```bash
~/.local/bin/k6 version
# Output: k6 v0.55.0 ...
```

### 2. Buat folder hasil
```bash
mkdir -p load-test/results
```

### 3. Daftarkan test user (WAJIB, jalankan sekali)
Script ini mendaftarkan 250 akun dummy ke production. Jika user sudah ada, langsung lanjut.
```bash
~/.local/bin/k6 run load-test/scenario-0-setup.js
```

---

## Urutan Eksekusi Test

### Skenario 1 — 100 DM Users (Baseline)
```bash
~/.local/bin/k6 run load-test/scenario-1-dm-100users.js \
  --out json=load-test/results/scenario-1.json \
  2>&1 | tee load-test/results/scenario-1.txt
```
**Durasi**: ~3 menit 30 detik  
**Yang diukur**: WS connect time, message latency, throughput

---

### Skenario 2 — Group Chat 10 Users
```bash
~/.local/bin/k6 run load-test/scenario-2-group-10users.js \
  --out json=load-test/results/scenario-2.json \
  2>&1 | tee load-test/results/scenario-2.txt
```
**Durasi**: ~3 menit  
**Yang diukur**: Fanout broadcast latency, semua member menerima semua pesan

---

### Skenario 3 — Stress Test 250 Users (Breaking Point)
```bash
~/.local/bin/k6 run load-test/scenario-3-stress-250users.js \
  --out json=load-test/results/scenario-3.json \
  2>&1 | tee load-test/results/scenario-3.txt
```
**Durasi**: ~5 menit 30 detik  
**Yang diukur**: Di stage mana koneksi mulai gagal, kapan latency meledak

---

### Skenario 4 — Spike Login Burst
```bash
~/.local/bin/k6 run load-test/scenario-4-spike-login.js \
  --out json=load-test/results/scenario-4.json \
  2>&1 | tee load-test/results/scenario-4.txt
```
**Durasi**: ~1 menit 30 detik  
**Yang diukur**: Rate limiter 429, server error 5xx, recovery time

---

## Cara Membaca Hasil

Contoh output k6 yang perlu diperhatikan:

```
✓ ws connected           90.00% ✓ 900    ✗ 100       ← % koneksi berhasil
wuzz_ws_connect_ms......: avg=342ms  p(95)=1823ms      ← Waktu handshake WS
wuzz_messages_sent......: 4500                          ← Total pesan terkirim
wuzz_msg_latency_ms.....: avg=210ms  p(95)=780ms        ← Round-trip latency
http_req_failed.........: 2.34%                         ← Error rate REST
```

### Tanda Bahaya 🚨
- `ws connected` rate turun di bawah 70% → server sudah kewalahan
- `wuzz_ws_connect_ms p(95)` > 3 detik → WS handshake lambat (OOM / CPU throttling)
- `http_req_failed` > 10% → rate limiter terlalu ketat atau DB pool habis
- `wuzz_stress_conn_failed` naik tajam di stage tertentu → itu breaking point

---

## Infrastruktur Production

| Item | Nilai |
|---|---|
| Server | `wuzz-chat-backend.fly.dev` |
| VM | Fly.io `shared-cpu-1x`, 256 MB RAM |
| DB | Supabase PostgreSQL (`ap-northeast-2`) |
| Media | Supabase Storage |
| Broker | Redis (Upstash) |
| WS Library | gorilla/websocket |
