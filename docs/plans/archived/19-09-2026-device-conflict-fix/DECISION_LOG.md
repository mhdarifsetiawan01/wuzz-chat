# Decision Log

- **DEC-014**: Penerapan *Defense-in-Depth* pada Pembatalan Konflik Perangkat & Logout.
  - **Konteks**: Saat Device 2 gagal login karena ada sesi aktif di Device 1 dan memilih *"Batalkan & Keluar"*, Device 2 tidak boleh mengosongkan `active_device_id` di database.
  - **Keputusan**:
    1. Frontend: Device 2 hanya melakukan pembatalan lokal (`localLogout`) tanpa memanggil `POST /api/auth/logout`.
    2. Backend: `POST /api/auth/logout` wajib device-aware; query SQL mengosongkan `active_device_id` hanya jika device pemohon cocok dengan `active_device_id` di database.
