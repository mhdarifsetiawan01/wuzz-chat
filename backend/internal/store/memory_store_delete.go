package store

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

// ReviewActionDeleted mencatat penghapusan memori/draf oleh admin di log audit (tanpa isi).
const ReviewActionDeleted = "DELETED"

// rebind mengubah placeholder `?` menjadi `$n` untuk PostgreSQL.
func (s *SQLMemoryStore) rebind(query string) string {
	if s.driverName != "postgres" {
		return query
	}
	var b strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// DeleteDraftCascade menghapus satu draf beserta seluruh turunannya dalam satu transaksi: bukti kutipan, artefak,
// memori terbit (bila ada) beserta catatan bacanya, dan job asalnya. Database tidak memakai foreign key, jadi urutan
// dan cakupan penghapusan dijaga di sini.
//
// Log audit (memory_review_actions) dipertahankan sebagai jejak tindakan, tetapi isinya (old/new content, alasan) dikosongkan
// karena memuat kutipan teks pesan, lalu ditambah satu baris DELETED. Karena job ikut dihapus, topik forum yang sama
// dapat diringkas ulang bila job baru dibuat.
func (s *SQLMemoryStore) DeleteDraftCascade(ctx context.Context, draftID, adminID string) error {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("gagal memulai transaksi hapus memori: %w", err)
	}
	defer tx.Rollback()

	var jobID string
	err = tx.QueryRowContext(ctx,
		s.rebind(`SELECT job_id FROM memory_drafts WHERE id = ? AND tenant_id = ?`), draftID, tenantID).Scan(&jobID)
	if err == sql.ErrNoRows {
		return ErrDraftNotFound
	}
	if err != nil {
		return fmt.Errorf("gagal membaca draft: %w", err)
	}

	stmts := []struct {
		query string
		args  []any
	}{
		{`DELETE FROM artifact_evidences WHERE artifact_id IN (SELECT id FROM memory_artifacts WHERE draft_id = ?)`, []any{draftID}},
		{`DELETE FROM memory_artifacts WHERE draft_id = ?`, []any{draftID}},
		{`DELETE FROM memory_view_events WHERE approved_memory_id IN (SELECT id FROM approved_memories WHERE draft_id = ? AND tenant_id = ?)`, []any{draftID, tenantID}},
		{`DELETE FROM approved_memories WHERE draft_id = ? AND tenant_id = ?`, []any{draftID, tenantID}},
		{`UPDATE memory_review_actions SET old_content = '', new_content = '', rejection_reason = '' WHERE draft_id = ?`, []any{draftID}},
		{`DELETE FROM memory_drafts WHERE id = ? AND tenant_id = ?`, []any{draftID, tenantID}},
	}
	for _, st := range stmts {
		if _, err := tx.ExecContext(ctx, s.rebind(st.query), st.args...); err != nil {
			return fmt.Errorf("gagal menghapus data memori: %w", err)
		}
	}
	if jobID != "" {
		if _, err := tx.ExecContext(ctx,
			s.rebind(`DELETE FROM forum_memory_jobs WHERE id = ? AND tenant_id = ?`), jobID, tenantID); err != nil {
			return fmt.Errorf("gagal menghapus job memori: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx,
		s.rebind(`INSERT INTO memory_review_actions (id, draft_id, admin_id, action, created_at) VALUES (?, ?, ?, ?, ?)`),
		uuid.New().String(), draftID, adminID, ReviewActionDeleted, time.Now().UTC()); err != nil {
		return fmt.Errorf("gagal mencatat audit hapus: %w", err)
	}

	return tx.Commit()
}
