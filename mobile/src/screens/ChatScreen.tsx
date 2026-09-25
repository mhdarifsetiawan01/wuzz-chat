/**
 * WuzzChat ChatScreen Component
 * WhatsApp-grade chat timeline with sticky header, realtime WebSocket messaging,
 * optimistic updates, and Anti-Stale Reprocessing Guards.
 * Conforms to Mandatory Dual-Platform Frontend Architecture Rule.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConversationItem, Message } from '../api/types';
import { websocketClient } from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/Avatar';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInputBar } from '../components/ChatInputBar';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface ChatScreenProps {
  conversation: ConversationItem;
  onBack: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ conversation, onBack }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const lastHandledMsgIdRef = useRef<string | null>(null);

  const roomId = conversation.id;
  const currentUserId = user?.id || '';

  // 1. Load History & Join Room on Mount (Clean History State Sync via WebSocket)
  useEffect(() => {
    setIsLoading(true);

    // Timeout safety in case history event is empty or room is newly created
    const timeout = setTimeout(() => {
      setIsLoading(false);
    }, 4000);

    // Subscribe to 'history' event from WebSocket Hub
    const unsubscribeHistory = websocketClient.on('history', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom && targetRoom !== roomId) return;

      clearTimeout(timeout);
      const rawMessages = data.messages || [];
      const mapped: Message[] = rawMessages.map((m: any) => ({
        id: m.id || `hist_${Math.random()}`,
        room_id: m.room || m.room_id || roomId,
        sender_id: m.sender_id || m.from || '',
        content: m.content || '',
        from: m.from || m.nickname,
        created_at: m.timestamp || m.created_at || new Date().toISOString(),
        timestamp: m.timestamp || m.created_at || new Date().toISOString(),
        status: m.status || 'sent',
      }));

      // Sort chronological
      mapped.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
        const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
        return timeA - timeB;
      });

      setMessages(mapped);
      setIsLoading(false);

      // Auto-scroll to bottom once history rendered
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    });

    // Join room via WebSocket & send read receipt
    websocketClient.joinRoom(roomId);
    websocketClient.sendReceipt(roomId, 'read');

    return () => {
      clearTimeout(timeout);
      unsubscribeHistory();
    };
  }, [roomId]);

  // 2. Realtime WebSocket Listeners (Anti-Stale Reprocessing Guard)
  useEffect(() => {
    // A. Incoming Message Listener
    const unsubscribeMessage = websocketClient.on('message', (incoming: any) => {
      const targetRoom = incoming.room || incoming.room_id;
      if (targetRoom !== roomId) return;

      const incomingId = incoming.id || incoming.request_id;
      if (incomingId && incomingId === lastHandledMsgIdRef.current) {
        return; // Guard anti-duplicate
      }
      if (incomingId) {
        lastHandledMsgIdRef.current = incomingId;
      }

      const newMsg: Message = {
        id: incoming.id || `msg_${Date.now()}`,
        room_id: targetRoom,
        sender_id: incoming.sender_id || incoming.from || '',
        content: incoming.content || '',
        from: incoming.from,
        created_at: incoming.timestamp || incoming.created_at || new Date().toISOString(),
        timestamp: incoming.timestamp || incoming.created_at || new Date().toISOString(),
        status: (incoming.sender_id === currentUserId || incoming.from === currentUserId) ? 'sent' : 'delivered',
      };

      setMessages((prev) => {
        // If an optimistic message with matching request_id exists, replace it
        if (incoming.request_id) {
          const existsIndex = prev.findIndex((m) => m.id === incoming.request_id);
          if (existsIndex !== -1) {
            const updated = [...prev];
            updated[existsIndex] = { ...newMsg, id: incoming.id || updated[existsIndex].id };
            return updated;
          }
        }
        // Avoid duplicate by id
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev;
        }
        return [...prev, newMsg];
      });

      // Send read receipt for incoming peer message
      if (incoming.sender_id !== currentUserId && incoming.from !== currentUserId) {
        websocketClient.sendReceipt(roomId, 'read');
      }

      // Auto scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    // B. Server ACK Listener
    const unsubscribeAck = websocketClient.on('ack', (ack: any) => {
      if (ack.request_id) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === ack.request_id ? { ...msg, status: 'sent' } : msg
          )
        );
      }
    });

    // C. Read / Delivered Receipt Listener
    const unsubscribeReceipt = websocketClient.on('receipt', (receipt: any) => {
      const targetRoom = receipt.room || receipt.room_id;
      if (targetRoom !== roomId) return;

      const newStatus = receipt.status as 'delivered' | 'read';
      if (newStatus === 'read' || newStatus === 'delivered') {
        setMessages((prev) =>
          prev.map((msg) => {
            // Update outgoing messages that haven't reached this status yet
            if (msg.sender_id === currentUserId || msg.status === 'sent') {
              return { ...msg, status: newStatus };
            }
            return msg;
          })
        );
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeAck();
      unsubscribeReceipt();
    };
  }, [roomId, currentUserId]);

  // 3. Handle Send Message (Optimistic UI)
  const handleSendMessage = useCallback(
    (text: string) => {
      const tempId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const nowIso = new Date().toISOString();

      const optimisticMsg: Message = {
        id: tempId,
        room_id: roomId,
        sender_id: currentUserId,
        content: text,
        created_at: nowIso,
        timestamp: nowIso,
        status: 'sending',
      };

      // Immediate render on screen
      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);

      // Send through WebSocket
      const sent = websocketClient.sendMessage(roomId, text, tempId);
      if (!sent) {
        // Mark as failed if socket is closed
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
      }
    },
    [roomId, currentUserId]
  );

  const title = conversation.title || conversation.peer_nickname || 'Obrolan';
  const avatarUrl = conversation.avatar_url || conversation.peer_avatar_url;
  const isDirect =
    conversation.type === 'direct' ||
    conversation.is_group === false ||
    (typeof conversation.id === 'string' && conversation.id.startsWith('dm_')) ||
    (!conversation.type && !conversation.is_group);
  const isGroup = !isDirect && (conversation.type === 'group' || conversation.type === 'subgroup' || conversation.is_group === true);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sticky Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            activeOpacity={0.7}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>

          <View style={styles.headerAvatarContainer}>
            <Avatar
              name={title}
              avatarUrl={avatarUrl}
              size={38}
              isGroup={isGroup}
            />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.headerStatusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.headerSubtitle}>
                {isDirect ? 'Terhubung (Online)' : `${conversation.type === 'subgroup' ? 'Topik Forum' : 'Grup'}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Message Timeline */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accentPrimary} />
            <Text style={styles.loadingText}>Memuat pesan...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>Belum ada pesan</Text>
            <Text style={styles.emptySubtitle}>Kirim pesan pertama Anda untuk memulai percakapan.</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelf =
                item.sender_id === currentUserId ||
                (Boolean(user?.username) && item.from === user?.username);

              return (
                <MessageBubble
                  message={item}
                  isSelf={isSelf}
                  showSenderName={!isDirect && !isSelf}
                  senderName={item.from}
                />
              );
            }}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Chat Input Bar */}
        <ChatInputBar onSend={handleSendMessage} disabled={isSending} />
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    zIndex: 50,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  headerAvatarContainer: {
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.colorOnline,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.colorOnline,
  },
  listContent: {
    paddingVertical: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
