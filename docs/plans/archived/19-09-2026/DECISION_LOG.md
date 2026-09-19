# Decision Log

- **DEC-014: Explicit Logout Endpoint & Active Device Release**
  - **Konteks:** Alice logout dari Device 1, namun `active_device_id` di database tetap terpasang pada Device 1 karena ketiadaan endpoint logout di server. Saat Alice login di Device 2, server menolak pendaftaran kunci dengan HTTP 409 Conflict dan memunculkan pop-up *"Perangkat lain sedang aktif"*.
  - **Keputusan:** Menambahkan endpoint resmi `POST /api/auth/logout`. Saat pengguna memanggil logout, server mengosongkan kolom `users.active_device_id = ''`. Perangkat berikutnya yang login dapat langsung mendaftarkan kunci sebagai sesi aktif baru tanpa memicu konflik palsu.

- **DEC-015: Single Consolidated Banner for Encrypted Messages UX**
  - **Konteks:** Ketika kunci dirotasi atau perangkat baru tidak memiliki kunci privat masa lalu, puluhan pesan masa lalu gagal didekripsi dan tampil sebagai deretan bubble `🔒 [Pesan Terenkripsi]`. Ini mengotori tampilan dan menurunkan kepuasan pengguna.
  - **Keputusan:** Menyaring bubble pesan individu yang gagal didekripsi dari linimasa chat, lalu merangkumnya ke dalam **1 banner sistem ringkas** di bagian paling atas linimasa obrolan yang memberitahukan total pesan yang terenkripsi dan alasan kunci dirotasi.
