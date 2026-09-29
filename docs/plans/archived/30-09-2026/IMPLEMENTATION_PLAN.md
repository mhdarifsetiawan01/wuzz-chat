# Implementation Plan — Backend HTTP Request & Auth Logging Middleware

## 1. Objectives
- Implement production-grade HTTP Request Logging Middleware in Go backend (`backend/internal/app/router.go`).
- Log every incoming HTTP request method, path, HTTP response status code, execution duration, client IP, and User-Agent.
- Full support for `http.Hijacker` and `http.Flusher` to ensure WebSocket upgrade (`/ws`) functions without regression.
- Add granular log outputs in `AuthHandler` (`backend/internal/api/auth_handler.go`) for:
  - Login attempts (username, client IP, device ID, platform)
  - Login failures (invalid credentials / username not found)
  - Login device limit conflicts (HTTP 409 `DEVICE_LIMIT_REACHED`)
  - Login successes (username, user ID, device ID)
  - Registration attempts, successes, and errors.

## 2. Target Files
- `backend/internal/app/router.go`: Request logger middleware wrapping the root HTTP handler.
- `backend/internal/api/auth_handler.go`: Explicit auth lifecycle logging.
- `backend/internal/app/router_test.go` or `backend/internal/app/app_test.go`: Verify request logger middleware and hijacker compatibility.

## 3. Verification Strategy
- Run `go test -v ./...` across backend packages.
- Test HTTP requests with curl and verify log output.
- Test WebSocket connection and ensure hijacking works seamlessly.
