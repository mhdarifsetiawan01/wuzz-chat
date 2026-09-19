# Implementation Plan — Sub-Group Join Request Notification Engine

## 🎯 Objective
Menerapkan sistem notifikasi real-time ganda (WebSocket + Web Push) dan badge counter untuk permohonan bergabung (*join request*) ke subgrup privat, disaring secara eksklusif hanya untuk admin & creator yang merupakan bagian dari subgrup tersebut.

## 📂 Target Modified Files
1. `backend/internal/store/user_store.go` & `group_store.go`:
   - Penambahan interface & method `GetSubGroupAdmins(subGroupID string) ([]string, error)`
   - Modifikasi `GetSubGroups` untuk menyertakan `pending_requests_count`
2. `backend/internal/push/push.go`:
   - Penambahan method `NotifyUsers(userIDs []string, title, body, tag, url string)`
3. `backend/internal/ws/hub.go`:
   - Penambahan method `NotifyUsers(userIDs []string, msg Message)`
4. `backend/internal/api/group_handler.go`:
   - Injeksi `pushService` ke `GroupHandler` (atau via Hub)
   - Pada `handleRequestToJoinSubGroup`: dispatch notifikasi ke admin subgrup
   - Pada `handleRespondJoinRequest`: dispatch notifikasi hasil tindakan ke pemohon
5. `frontend/lib/types.ts`:
   - Penambahan `pending_requests_count?: number` pada `SubGroupItem`
6. `frontend/app/chat/SubGroupListDrawer.tsx`:
   - Penampilan badge oranye/merah jika `pending_requests_count > 0` pada tombol "📋 Kelola Izin"
7. `frontend/app/chat/page.tsx`:
   - Listener WebSocket untuk event notifikasi permohonan izin (menampilkan toast langsung dan me-refresh count)

## 🧪 Verification Strategy
- `go test -v ./...` di folder `backend/` untuk memverifikasi seluruh unit & integration test backend.
- `npm run build` di folder `frontend/` untuk memverifikasi type safety & zero lint errors.
