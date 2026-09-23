# Decision Log — Track B: Modular Monolith Fase 3

## Log Keputusan Arsitektur

### DEC-001: Strangler Fig Pattern untuk Adapter SQL Messaging
- **Konteks**: Arsitektur saat ini memiliki `store.MessageStore` dan `store.UserStore` dengan puluhan method aktif di Postgres dan SQLite. Big-bang rewrite tabel/query berisiko tinggi terhadap regresi.
- **Keputusan**: Membuat `messaging/infra/sql_repository.go` sebagai adapter tipis yang mendelegasikan pemanggilan ke `store.MessageStore` & `store.UserStore`.
- **Dampak**: 100% backward-compatible, query database eksisting tetap stabil, tidak memerlukan migrasi SQL baru.

### DEC-002: Hub Decoupling via Minimal Interface `RoomAuthorizationChecker`
- **Konteks**: `ws.Hub` selama ini mengimpor `store.UserStore` hanya untuk `GetConversationMemberUsernames` dan `IsUserInConversation`. Hal ini menciptakan coupling erat antara realtime transport dan database storage.
- **Keputusan**: Mendefinisikan interface minimal `RoomAuthorizationChecker` di `ws/` dan mengganti dependensi `userStore` di `Hub` dengan interface ini.
- **Dampak**: `ws/` terlepas dari ketergantungan DB; mempermudah testing dan clustering.
