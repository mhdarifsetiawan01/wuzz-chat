package store

import (
	"context"
	"database/sql"
	"fmt"
)

// CrossTenantMembership menggambarkan baris conversation_members yang user-nya berasal dari tenant
// berbeda dengan percakapannya. Seharusnya tidak pernah ada; baris seperti ini adalah sisa celah
// isolasi lama (DM lintas tenant atau member_ids awal grup) dan perlu ditinjau lalu dibersihkan.
type CrossTenantMembership struct {
	ConversationID     string `json:"conversation_id"`
	ConversationType   string `json:"conversation_type"`
	ConversationTenant string `json:"conversation_tenant"`
	UserID             string `json:"user_id"`
	UserTenant         string `json:"user_tenant"`
}

// FindCrossTenantMemberships mencari keanggotaan percakapan lintas tenant. Hanya membaca, tidak mengubah data.
func FindCrossTenantMemberships(ctx context.Context, db *sql.DB) ([]CrossTenantMembership, error) {
	const query = `
		SELECT cm.conversation_id, COALESCE(c.type, ''), COALESCE(c.tenant_id, 'default'),
		       cm.user_id, COALESCE(u.tenant_id, 'default')
		FROM conversation_members cm
		JOIN conversations c ON c.id = cm.conversation_id
		JOIN users u ON u.id = cm.user_id
		WHERE COALESCE(c.tenant_id, 'default') <> COALESCE(u.tenant_id, 'default')
		ORDER BY cm.conversation_id, cm.user_id`

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("audit keanggotaan lintas tenant: %w", err)
	}
	defer rows.Close()

	var out []CrossTenantMembership
	for rows.Next() {
		var m CrossTenantMembership
		if err := rows.Scan(&m.ConversationID, &m.ConversationType, &m.ConversationTenant, &m.UserID, &m.UserTenant); err != nil {
			return nil, fmt.Errorf("audit keanggotaan lintas tenant: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
