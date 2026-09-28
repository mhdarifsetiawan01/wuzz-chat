# Decision Log — Mobile Device Limit Selection

## DEC-001: Model Pemilihan Perangkat pada Mobile React Native
- **Konteks**: Di web, saat login mencapai kuota 2 perangkat, server mengembalikan 409 dengan daftar `active_devices`. Pengguna web dapat memilih perangkat mana yang ingin dikeluarkan. Di mobile, sebelumnya hanya ada `Alert.alert` yang memicu auto-kick FIFO tanpa parameter `kick_device_id`.
- **Keputusan**: Mengimplementasikan `DeviceLimitModal` di React Native dengan styling token WuzzChat yang sejajar dengan Web. Default seleksi tetap diarahkan ke perangkat paling lama (FIFO) demi kenyamanan pengguna, namun pengguna tetap memiliki kebebasan penuh memilih perangkat lain.
