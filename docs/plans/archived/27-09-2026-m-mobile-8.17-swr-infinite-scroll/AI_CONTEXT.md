# AI_CONTEXT.md — Active Context & Boundaries

## Target Repository & Workspace
- **Workspace**: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- **Sub-Project**: `mobile/` (React Native Expo Managed Workflow)
- **Active Git Branch**: `dev` (strictly non-production, protected `main` intact)

## Milestone Scope
- **Milestone ID**: `M-Mobile-8.17`
- **Feature**: Room Messages SWR Cache & Timeline In-Memory State
- **Goal**:
  1. Eliminate the blank loading screen / spinner when entering a chat room (`ChatScreen`) by rendering cached in-memory messages instantly (0ms).
  2. Implement global in-memory message cache (`MessageContext`) storing messages per room (`messagesByRoom: Record<string, Message[]>`).
  3. Perform silent background revalidation on room entry (*stale-while-revalidate*).
  4. Centralize live incoming message & event ingestion (messages, acks, receipts, reactions, deletions, edits, pins) so cached rooms stay synchronized even when minimized.

## Environment & Tool Constraints
- TypeScript Typecheck: `cd mobile && npx tsc --noEmit` must pass with 0 errors.
- UI Design Guidelines: Must adhere to `mobile/DESIGN.md` (Aurora Dark Mode, 44dp touch targets, safe area insets).
- Git Commit Safety: STRICT NO COMMIT before user explicitly states "selesai".
