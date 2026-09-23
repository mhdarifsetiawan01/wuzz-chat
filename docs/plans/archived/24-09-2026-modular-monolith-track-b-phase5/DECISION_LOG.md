# Decision Log — Track B Phase 5

## DEC-001: Strangler Fig Pattern untuk Repository Memory
- **Status**: Accepted
- **Context**: Mengalihkan ketergantungan langsung dari `store.MemoryStore` ke `memory.MemoryRepository` tanpa perlu melakukan rewrite tabel atau breaking changes pada database production.
- **Decision**: Bungkus `store.MemoryStore` dalam `memory/infra/sql_repository.go` yang mengimplementasikan `memory.MemoryRepository`.

## DEC-002: ContextSource Abstraction Design
- **Status**: Accepted
- **Context**: Memory Engine saat ini hardcoded membaca room messages dan group details. Diperlukan interface yang decoupled agar di masa depan bisa memproses Direct Chat dan Group Chat.
- **Decision**: Interface `ContextSource` mendefinisikan `GetMessages`, `GetContextMeta`, dan `GetAuthorizedViewers`. Implementasi pertama adalah `ForumContextSource` di domain `group/infra/`.

## DEC-003: Backward-Compatible Constructors
- **Status**: Accepted
- **Context**: Mencegah breaking changes pada unit test atau package lain yang memanggil `NewMemoryHandler` atau `NewMemoryProcessor`.
- **Decision**: Pertahankan constructor lama dengan fallback otomatis ke adapter baru, serta sediakan constructor baru untuk injeksi services secara eksplisit.
