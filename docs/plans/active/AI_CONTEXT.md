# AI Context — Milestone 5: Admin Review UI (Frontend Next.js)

## Active Focus
- **Fitur**: Group Memory AI
- **Milestone**: M5 — Admin Review UI (Frontend Next.js)
- **Branch**: `feature/group-memory-ai`
- **Head Commit**: `08365f7`
- **Backend Readiness**: Endpoint REST API untuk review draft (`/api/memory/drafts/...`) sudah aktif dan terverifikasi 100%.

## Target Frontend Components
1. `frontend/lib/types.ts`: TypeScript contracts for Drafts, Artifacts, Evidences.
2. `frontend/lib/api.ts`: API clients for fetch drafts, get detail, approve, reject, edit, delete journey.
3. `frontend/app/chat/memory/MemoryDraftReviewModal.tsx`: Main modal / full-page review flow.
4. `frontend/app/chat/memory/ConfidenceBadge.tsx`: Visual confidence indicator (HIGH, MEDIUM, LOW).
5. `frontend/app/chat/memory/ReviewCards.tsx`: SummaryReviewCard, DecisionReviewCard with evidence snippets, JourneyLiteReviewCard.
6. `frontend/app/chat/SubGroupListDrawer.tsx`: Admin review entry point with badge count.
