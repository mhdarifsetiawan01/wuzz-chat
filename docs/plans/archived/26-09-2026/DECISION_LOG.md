# Decision Log: FCM Push Notification & Android Notification Bar Integration

- **DEC-016**: Implementasi FCM HTTP v1 menggunakan standard Google OAuth2 Service Account assertion token signing via standard Go crypto + `golang-jwt/jwt/v5` tanpa dependensi SDK berat, sehingga performa tetap ultra-ringan dan kompatibel dengan Fly.io deployment.
- **DEC-017**: Dual notification pipeline di mobile client: Local Notification dipicu secara real-time saat WebSocket aktif, dan Remote Push (FCM v1) dipicu oleh backend saat client offline / process killed.
