# Decision Log — Milestone M-Mobile-5

- **Status**: Planning & Awaiting User Approval ⏳

### DEC-M13: Pilihan Library Image Picker untuk Expo Mobile
- **Context**: Milestone M-Mobile-5 membutuhkan akses kamera dan galeri untuk memilih gambar media di aplikasi mobile Expo (`mobile/`).
- **Options Considered**:
  1. `expo-image-picker`: Library resmi Expo, kompatibel penuh dengan SDK 57, mendukung `launchCameraAsync` dan `launchImageLibraryAsync`, permission handling bawaan, dan mengembalikan file URI, mimeType, serta metadata dimensi secara konsisten di iOS dan Android.
  2. `react-native-image-picker`: Membutuhkan native linking dan konfigurasi manual yang lebih rumit di managed Expo workflow.
- **Decision**: Memilih `expo-image-picker` (`~57.0.20`) sesuai dengan Expo SDK 57 yang digunakan proyek.

### DEC-M14: Protokol Pengunggahan Media dan Timeout Jaringan Lambat
- **Context**: Sesuai dengan *Mandatory Slow & Flaky Server Resilience Rule*, pengunggahan file media berukuran besar tidak boleh menggantung tanpa batas waktu atau menyebabkan UI freeze.
- **Decision**: Menggunakan `AbortController` dengan batas waktu 60 detik khusus untuk pengunggahan media (`timeoutMs: 60000`). Pengunggahan dilakukan via `multipart/form-data` ke `POST /api/media/upload` sebelum pesan WebSocket dikirimkan. Jika jaringan terputus atau batas waktu terlampaui, tampilkan pesan error yang ramah dan kembalikan state tombol agar pengguna dapat mencoba kembali.

### DEC-M15: WhatsApp Store-and-Forward ACK Lifecycle pada Mobile
- **Context**: Backend WuzzChat mengadopsi pola WhatsApp Store-and-Forward di mana berkas gambar 1-on-1 dihapus dari Supabase Storage segera setelah penerima mengonfirmasi unduhan melalui `POST /api/media/ack`.
- **Decision**: Saat komponen `MessageBubble` atau `ChatScreen` pada klien penerima merender pesan gambar yang berasal dari lawan bicara (`sender_id !== currentUserId`), klien secara asinkron memanggil `acknowledgeMediaDownload(message.id, message.room_id)` untuk memastikan siklus retensi media backend berjalan optimal.

### DEC-M16: Expo SDK 57 / React Native 0.86 FormData & Scoped Storage WinterCG Stream
- **Context**: Pada Android Expo Managed Workflow (React Native 0.86), pengunggahan multipart via `{ uri, name, type }` ditolak oleh WinterCG FormData (`Unsupported FormDataPart implementation`), penggunaan `new File()` melempar getter-only name error, dan `fetch(localUri)` dicegat oleh `OkHttpFileUrlInterceptor` yang mengembalikan pesan 14-byte 404 `"File not found"` akibat Scoped Storage Android 11+.
- **Decision**: Menggunakan `ImagePicker` dengan `base64: true`, mendekode base64 string menjadi `Uint8Array` secara in-memory menggunakan `base64-js`, dan menginjeksi part object dengan implementasi metode `.bytes()` async (`bytes: async () => bytes`) ke `FormData.append('file', ...)`. Pola ini mematuhi standar WinterCG Expo tanpa error binary blob React Native dan memastikan binary JPEG utuh terunggah ke backend.

