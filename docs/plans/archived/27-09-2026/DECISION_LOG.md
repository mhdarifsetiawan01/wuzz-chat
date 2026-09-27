# Decision Log: Mobile Conversation Global Context & SWR Layer

## DEC-030: Separation of Conversation Global Context and SWR Caching
- **Date**: 2026-09-27
- **Context**: Mobile app re-renders spinner "Memuat obrolan..." every time navigating back from `ChatScreen` or switching screens because `RecentChatsScreen` held conversation state locally.
- **Decision**: Introduce `ConversationContext` above `AppNavigator` inside `AuthProvider`. Maintain conversations in context memory across screen navigations.
- **Rationale**: Provides WhatsApp/Telegram-grade UX with 0ms transition time when returning to the recent chats list, while keeping data fresh using silent background revalidation (`isSilent: true`) and WebSocket ingestion.
