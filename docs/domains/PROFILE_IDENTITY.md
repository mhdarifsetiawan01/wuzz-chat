# 👤 Domain: User Profile & Identity (`PROFILE_IDENTITY`)

Dokumen ini adalah spesifikasi definitif untuk domain **Identitas Pengguna, Profil Publik, Avatar Studio, dan Sistem Akun Terverifikasi** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **UUID-First Identity Rule**:
   - `users.id` (UUIDv4) adalah satu-satunya identifier primer yang kekal (*immutable*).
   - Seluruh relasi kepemilikan pesan, keanggotaan room, reaksi, dan tanda terima **WAJIB** merujuk ke UUID ini.
   - Perubahan `username` atau `display_name` tidak boleh merusak riwayat pesan atau integritas hak akses.
2. **Keunikan & Format Username**:
   - `username`: Huruf kecil alfanumerik (3–32 karakter), unik di database.
   - `display_name`: Nama tampilan publik bebas (maksimal 64 karakter).
3. **Akun Terverifikasi (Verified Badge)**:
   - Kolom `is_verified` (boolean): Menandakan akun resmi / terverifikasi.
   - Komponen `VerifiedBadge` centang biru ditampilkan di sebelah nama pengguna di Sidebar, StatusBar, MessageBubble, ContactModal, dan ProfileModal.
4. **Proteksi Anti-Stale History Overwrite**:
   - Nama dan avatar kontak yang diambil dari query kontak terkini tidak boleh ditimpa oleh rekaman nama usang yang tersimpan dalam riwayat pesan masa lalu.

---

## 🏛️ 2. Avatar Studio & Generator Avatar Modular

Aplikasi mendukung 3 jalur pembuatan avatar pengguna:
1. **Foto Kustom Asli**:
   - Diunggah melalui file picker atau kamera.
   - Dikompresi di sisi klien via `imageCompressor.ts` (format WebP, resolusi maks 1600px, quality 0.82) sebelum dikirim ke Supabase Storage.
2. **Preset 3D Emoji Avatar**:
   - Koleksi emoji 3D beresolusi tinggi yang dapat dipilih langsung tanpa perlu mengunggah foto.
3. **Generator Inisial Deterministik (`avatarColor.ts`)**:
   - Jika pengguna tidak memiliki foto avatar, sistem menghasilkan avatar inisial 2 huruf dengan latar warna palet deterministik berbasis hashing string `username`.

---

## 🗄️ 3. Skema Basis Data (`users`)

```sql
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    display_name VARCHAR(64) NOT NULL,
    avatar_url TEXT DEFAULT '',
    is_verified BOOLEAN DEFAULT FALSE,
    public_key TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

---

## 🔌 4. Kontrak REST API

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `GET` | `/api/users/profile` | Terproteksi | Mengambil data profil pengguna yang sedang login |
| `PUT` | `/api/users/profile` | Terproteksi | Memperbarui display name atau URL avatar |
| `GET` | `/api/users/search?q={query}` | Terproteksi | Mencari pengguna lain berdasarkan username / display name |
| `GET` | `/api/users/{id}` | Terproteksi | Mengambil data profil publik pengguna tertentu |
| `PUT` | `/api/users/public-key` | Terproteksi | Mendaftarkan/memperbarui public key E2EE perangkat |

---

## 💻📱 5. Komponen Antarmuka (Web & Mobile)
- **Komponen Avatar Terpadu**: `UserAvatar.tsx` (merender foto asli, inisial deterministik, dan indikator status online/offline).
- **Lencana Verifikasi**: `VerifiedBadge.tsx` (icon SVG centang biru standar Twitter/Telegram).
- **Modal Profil Interaktif**: `ProfileModal.tsx` di Web dan `ProfileScreen.tsx` di Mobile (Avatar Studio tab, setting media cache, tombol logout terkelola).
