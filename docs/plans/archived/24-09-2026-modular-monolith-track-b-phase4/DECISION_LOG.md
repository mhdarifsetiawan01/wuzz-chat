# Decision Log — Track B: Modular Monolith Fase 4

## DEC-001: Strangler Fig Pattern untuk GroupRepository
- **Konteks**: `store.SQLGroupStore` (1505 baris) telah diekstrak di Fase 1 dan stabil di production Fly.io. Kita ingin memindahkan use cases tanpa mengganggu kompatibilitas database atau modul lain yang masih bergantung pada `store.GroupStore`.
- **Keputusan**: Gunakan adapter `internal/group/infra/sql_repository.go` yang membungkus `store.GroupStore` dan `store.UserStore`. Hal ini mengisolasi domain `group` dari package `store` lama secara bertahap tanpa breaking changes.

## DEC-002: Pemisahan Application Service Menjadi `GroupService` dan `ForumService`
- **Konteks**: Domain grup menangani dua konsep berbeda: Grup Persisten (organisasi, komunitas, chat permanen) dan Forum Ephemeral (subgrup bertempo waktu dengan auto-expire & AI memory).
- **Keputusan**: Buat dua service yang berfokus tunggal:
  1. `GroupService`: use cases CRUD grup, keanggotaan (add, remove, update role, self-join), dan pencarian grup publik.
  2. `ForumService`: use cases topik forum/subgrup, join requests privat, instant expire, dan integrasi trigger memory AI.

## DEC-003: Interface-Driven Realtime & Push Notifications
- **Konteks**: `GroupHandler` sebelumnya langsung bergantung pada pointer konkrit `*ws.Hub` dan `*push.Service`.
- **Keputusan**: Definisikan interface `GroupBroadcaster` dan `GroupNotifier` di `internal/group/service.go`. `*ws.Hub` dan `*push.Service` langsung memenuhi interface ini secara alami (Go structural typing) tanpa perlu pembungkus tambahan, memudahkan unit testing dengan mock.
