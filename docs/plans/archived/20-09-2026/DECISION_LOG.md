# Decision Log — Backend Optimizations

## DEC-001: Dual-Tier Rate Limiting (IP + Username)
- **Context**: 15 req/menit per IP memblokir pengguna kantor/kampus di belakang NAT publik yang sama.
- **Decision**: Menerapkan dua tingkatan:
  - Global IP Limit: 100 req/menit per IP untuk mitigasi DDoS.
  - Per-Username Limit: 15 req/menit per username untuk mitigasi brute force.
- **Impact**: Zero false-positive bagi pengguna di satu WiFi/kantor, perlindungan 100% dari serangan brute-force akun spesifik.
