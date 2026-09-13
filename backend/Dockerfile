# ==============================================================================
# Multi-Stage Build Dockerfile untuk Go Backend (Fly.io / GCP / Docker Deployment)
# Ukuran image akhir super ringan (< 25MB) dengan efisiensi memori tinggi
# ==============================================================================

# --- Stage 1: Build Stage ---
FROM golang:alpine AS builder

WORKDIR /app

# Install dependensi sistem yang dibutuhkan untuk build & SSL root certificates
RUN apk add --no-cache ca-certificates tzdata git

# Cache modul dependensi Go
COPY go.mod go.sum ./
RUN go mod download

# Salin source code
COPY . .

# Build binary Go yang di-strip (CGO_ENABLED=0 untuk pure static binary)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/wuzz-backend main.go

# --- Stage 2: Minimal Runtime Stage ---
FROM alpine:latest

WORKDIR /app

# Salin sertifikat SSL root & database timezone dari builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Buat non-root user demi keamanan kontainer
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Salin binary yang telah dikompilasi
COPY --from=builder /app/wuzz-backend /app/wuzz-backend

# Buat direktori upload lokal fallback dengan permission yang sesuai
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

USER appuser

# Default port
ENV PORT=8080
EXPOSE 8080

# Jalankan server
ENTRYPOINT ["/app/wuzz-backend"]
