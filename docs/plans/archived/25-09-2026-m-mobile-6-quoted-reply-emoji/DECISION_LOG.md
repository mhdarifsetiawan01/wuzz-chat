# Decision Log — Milestone M-Mobile-6

- **Milestone**: Milestone M-Mobile-6: Quoted Reply, Swipe-to-Reply & WhatsApp-Style Emoji Picker
- **Status**: Planning

---

### DEC-M17: React Native Native PanResponder for Swipe-to-Reply
- **Context**: Swipe-to-reply requires horizontal panning gesture and smooth spring release.
- **Decision**: Use React Native built-in `PanResponder` and `Animated` (`Animated.spring`, `interpolate`) rather than third-party gesture libraries (`react-native-gesture-handler`).
- **Rationale**: Built-in `PanResponder` requires zero extra native dependencies, avoids native compilation issues in Expo Go, and delivers 60fps performance for single-item horizontal panning. Gesture filter `dx > 15 && dx > 1.5 * dy` ensures vertical timeline scrolling remains completely unaffected.

### DEC-M18: Keyboard-Docked Fixed Tray for WhatsApp Emoji Picker
- **Context**: User explicitly requested WhatsApp-style emoji picker replacing the keyboard, not a floating popover covering chat.
- **Decision**: Implement a docked bottom tray with fixed height (280dp) inside `ChatInputBar`'s wrapper.
- **Rationale**: When opening the emoji picker, `Keyboard.dismiss()` hides the soft keyboard, and the 280dp tray expands at the bottom. Because the tray resides inside the input container below the text input, the FlatList adjusts its offset naturally without sudden jumps or covering messages.

### DEC-M19: Tap-to-Scroll Quoted Messages with Visual Highlight Pulse
- **Context**: Tapping a quoted message in a bubble should navigate to the original message.
- **Decision**: Store the `reply_to.id` and invoke `flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 })` while setting a temporary `highlightedMessageId` for 1.5 seconds.
- **Rationale**: Provides immediate visual clarity and feedback to the user on where the referenced message is located in the conversation timeline.

### DEC-M20: WhatsApp Quick Reactions & Contextual Action Sheet
- **Context**: Long-pressing a message should allow rapid emoji reactions and common message actions.
- **Decision**: Render a contextual Action Sheet containing a top 6-emoji quick reaction pill (`👍`, `❤️`, `😂`, `😮`, `😢`, `🙏`) followed by Quoted Reply, Copy Text (`expo-clipboard`), and Delete Message (with 60-second limit check for "Delete for Everyone").
- **Rationale**: Matches WhatsApp's mobile interaction pattern exactly, delivering high usability without cluttering individual chat bubbles with permanent buttons.

### DEC-M21: E2EE & WebSocket Protocol Wire Format Parity
- **Context**: The mobile app must communicate seamlessly with existing Go WebSocket Hub and Next.js web client.
- **Decision**: Use canonical wire payloads:
  - `reply_to`: `{ id: string, nickname: string, content: string }`
  - `reaction`: `{ type: "reaction", room: roomId, reaction: { message_id: string, emoji: string } }`
  - `message_deleted`: `{ type: "message_deleted", id: string, room: string }`
  - AES-256-GCM encrypted content in direct chat.
- **Rationale**: Ensures 100% interoperability between mobile and web users in both direct and group conversations.
