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
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ConversationItem, Message } from '../api/types';
import { getUserPublicKey } from '../api/users';
import { mediaApi } from '../api/media';
import { messagesApi } from '../api/messages';
import { websocketClient } from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import {
  deriveRoomAESKey,
  getOrDeriveRoomAESKey,
  cachePeerPublicKey,
  getCachedPeerPublicKey,
  encryptText,
  decryptText,
  isEncryptedMessage,
} from '../services/crypto';
import { Avatar } from '../components/Avatar';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInputBar, StagedMedia } from '../components/ChatInputBar';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface ChatScreenProps {
  conversation: ConversationItem;
  onBack: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ conversation, onBack }) => {
  const insets = useSafeAreaInsets();
  const { user, e2eeKeyPair } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [stagedMedia, setStagedMedia] = useState<StagedMedia | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [roomAESKey, setRoomAESKey] = useState<Uint8Array | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [actionSheetMessage, setActionSheetMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const lastHandledMsgIdRef = useRef<string | null>(null);
  const roomAESKeyRef = useRef<Uint8Array | null>(null);

  const roomId = conversation.id;
  const currentUserId = user?.id || '';

  const title = conversation.title || conversation.peer_nickname || 'Obrolan';
  const avatarUrl = conversation.avatar_url || conversation.peer_avatar_url;
  const isDirect =
    conversation.type === 'direct' ||
    conversation.is_group === false ||
    (typeof conversation.id === 'string' && conversation.id.startsWith('dm_')) ||
    (!conversation.type && !conversation.is_group);
  const isGroup = !isDirect && (conversation.type === 'group' || conversation.type === 'subgroup' || conversation.is_group === true);

  // 0. Resolve Peer Public Key & Derive Room AES Key (ECDH + HKDF)
  useEffect(() => {
    if (!isDirect) return;

    let mounted = true;

    async function resolvePeerAndKey() {
      let peerId = conversation.peer_id || '';
      if (!peerId && roomId.startsWith('dm_')) {
        const parts = roomId.replace(/^dm_/, '').split('_');
        peerId = parts[0] === currentUserId ? parts[1] : parts[0];
      }
      if (!peerId && conversation.participants?.length) {
        const other = conversation.participants.find((p) => p.id !== currentUserId);
        peerId = other?.id || '';
      }

      let peerPubKey = conversation.peer_public_key || (peerId ? getCachedPeerPublicKey(peerId) : undefined);
      if (!peerPubKey && peerId) {
        try {
          peerPubKey = (await getUserPublicKey(peerId)) || undefined;
          if (peerPubKey) {
            cachePeerPublicKey(peerId, peerPubKey);
          }
        } catch (err) {
          console.warn('[ChatScreen] Could not fetch peer public key:', err);
        }
      } else if (peerPubKey && peerId) {
        cachePeerPublicKey(peerId, peerPubKey);
      }

      if (!peerPubKey) {
        console.log('[ChatScreen] Peer does not have a registered public key yet.');
        return;
      }

      if (!e2eeKeyPair?.privateKeyHex) {
        console.log('[ChatScreen] Current device does not have an active private key yet.');
        return;
      }

      try {
        const derived = getOrDeriveRoomAESKey(e2eeKeyPair.privateKeyHex, peerPubKey, roomId);
        if (mounted) {
          roomAESKeyRef.current = derived;
          setRoomAESKey(derived);
        }
      } catch (err) {
        console.error('[ChatScreen] Failed to derive room AES key:', err);
      }
    }

    resolvePeerAndKey();

    return () => {
      mounted = false;
    };
  }, [isDirect, conversation.peer_id, conversation.peer_public_key, conversation.participants, roomId, currentUserId, e2eeKeyPair]);

  // 0B. Retroactively decrypt loaded messages once AES key is established
  useEffect(() => {
    if (!roomAESKey) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (isEncryptedMessage(m.content)) {
          try {
            const plain = decryptText(roomAESKey, m.content);
            return { ...m, content: plain, is_encrypted: true };
          } catch {
            return { ...m, content: '🔒 Pesan terenkripsi (kunci tidak cocok)', is_encrypted: true };
          }
        }
        return m;
      })
    );
  }, [roomAESKey]);

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
      const mapped: Message[] = rawMessages.map((m: any) => {
        let content = m.content || '';
        let isEncrypted = false;
        if (isEncryptedMessage(content)) {
          isEncrypted = true;
          if (roomAESKeyRef.current) {
            try {
              content = decryptText(roomAESKeyRef.current, content);
            } catch (err) {
              console.warn('[ChatScreen] History decrypt error:', err);
              content = '🔒 Pesan terenkripsi (kunci tidak cocok)';
            }
          }
        }
        let replyToObj: Message['reply_to'] | undefined = undefined;
        if (m.reply_to && m.reply_to.id) {
          replyToObj = {
            id: m.reply_to.id,
            nickname: m.reply_to.nickname || m.reply_to.from || '',
            content: m.reply_to.content || '',
          };
        }
        return {
          id: m.id || `hist_${Math.random()}`,
          room_id: m.room || m.room_id || roomId,
          sender_id: m.sender_id || m.from || '',
          content,
          is_encrypted: isEncrypted,
          from: m.from || m.nickname,
          nickname: m.nickname || m.from,
          created_at: m.timestamp || m.created_at || new Date().toISOString(),
          timestamp: m.timestamp || m.created_at || new Date().toISOString(),
          status: m.status || 'sent',
          reply_to: replyToObj,
          reactions: m.reactions || [],
          is_deleted: Boolean(m.is_deleted),
          media_url: m.media_url,
          media_type: m.media_type,
          file_name: m.file_name,
          file_size: m.file_size,
          media_status: m.media_status,
        };
      });

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

      let content = incoming.content || '';
      let isEncrypted = false;
      if (isEncryptedMessage(content)) {
        isEncrypted = true;
        if (roomAESKeyRef.current) {
          try {
            content = decryptText(roomAESKeyRef.current, content);
          } catch (err) {
            console.warn('[ChatScreen] Incoming message decrypt error:', err);
            content = '🔒 Pesan terenkripsi (kunci tidak cocok)';
          }
        }
      }

      let replyToObj: Message['reply_to'] | undefined = undefined;
      if (incoming.reply_to && incoming.reply_to.id) {
        replyToObj = {
          id: incoming.reply_to.id,
          nickname: incoming.reply_to.nickname || incoming.reply_to.from || '',
          content: incoming.reply_to.content || '',
        };
      }

      const newMsg: Message = {
        id: incoming.id || `msg_${Date.now()}`,
        room_id: targetRoom,
        sender_id: incoming.sender_id || incoming.from || '',
        content,
        is_encrypted: isEncrypted,
        from: incoming.from,
        nickname: incoming.nickname || incoming.from,
        created_at: incoming.timestamp || incoming.created_at || new Date().toISOString(),
        timestamp: incoming.timestamp || incoming.created_at || new Date().toISOString(),
        status: (incoming.sender_id === currentUserId || incoming.from === currentUserId) ? 'sent' : 'delivered',
        reply_to: replyToObj,
        reactions: incoming.reactions || [],
        is_deleted: Boolean(incoming.is_deleted),
        media_url: incoming.media_url,
        media_type: incoming.media_type,
        file_name: incoming.file_name,
        file_size: incoming.file_size,
        media_status: incoming.media_status,
      };

      setMessages((prev) => {
        // If an optimistic message with matching request_id exists, replace it
        if (incoming.request_id) {
          const existsIndex = prev.findIndex((m) => m.id === incoming.request_id);
          if (existsIndex !== -1) {
            const updated = [...prev];
            updated[existsIndex] = {
              ...newMsg,
              id: incoming.id || updated[existsIndex].id,
              media_url: updated[existsIndex].media_url || incoming.media_url,
            };
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

    // D. Reaction Listener
    const unsubscribeReaction = websocketClient.on('reaction', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom && targetRoom !== roomId) return;

      const targetId = data.id || data.reaction?.message_id;
      const reactions = data.reactions;
      if (targetId && reactions) {
        setMessages((prev) =>
          prev.map((m) => (m.id === targetId ? { ...m, reactions } : m))
        );
      }
    });

    // E. Message Deleted Listener
    const unsubscribeDeleted = websocketClient.on('message_deleted', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom && targetRoom !== roomId) return;

      const targetId = data.id || data.message_id;
      if (targetId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === targetId
              ? { ...m, is_deleted: true, content: 'Pesan ini telah dihapus' }
              : m
          )
        );
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeAck();
      unsubscribeReceipt();
      unsubscribeReaction();
      unsubscribeDeleted();
    };
  }, [roomId, currentUserId]);

  // 3. Image Picker Handlers
  const handlePickCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Izin Kamera Dibutuhkan',
          'Aplikasi membutuhkan izin kamera untuk mengambil foto secara langsung.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setStagedMedia({
          uri: asset.uri,
          fileName: asset.fileName || `camera_${Date.now()}.jpg`,
          fileSize: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
          width: asset.width,
          height: asset.height,
          base64: asset.base64 ?? undefined,
        });
      }
    } catch (err) {
      console.warn('[ChatScreen] Error launching camera:', err);
      Alert.alert('Gagal Mengakses Kamera', 'Terjadi kesalahan saat membuka kamera perangkat.');
    }
  };

  const handlePickGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Izin Galeri Dibutuhkan',
          'Aplikasi membutuhkan izin akses galeri untuk memilih foto dari perangkat Anda.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setStagedMedia({
          uri: asset.uri,
          fileName: asset.fileName || `gallery_${Date.now()}.jpg`,
          fileSize: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
          width: asset.width,
          height: asset.height,
          base64: asset.base64 ?? undefined,
        });
      }
    } catch (err) {
      console.warn('[ChatScreen] Error launching gallery:', err);
      Alert.alert('Gagal Mengakses Galeri', 'Terjadi kesalahan saat membuka galeri foto.');
    }
  };

  const handleCancelStagedMedia = () => {
    setStagedMedia(null);
  };

  const handleMediaLoaded = useCallback(
    (msg: Message) => {
      if (msg.sender_id !== currentUserId && msg.id) {
        mediaApi.acknowledgeMediaDownload(msg.id, roomId).catch((err) => {
          console.log('[ChatScreen] Media ACK notice:', err.message);
        });
      }
    },
    [currentUserId, roomId]
  );

  // 4. Handle Send Message (Optimistic UI + Media Upload + Transparent E2EE)
  const handleSendMessage = useCallback(
    async (text: string, media?: StagedMedia | null) => {
      const trimmedText = text.trim();
      if (!trimmedText && !media) return;

      const tempId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const nowIso = new Date().toISOString();

      let uploadedMediaUrl: string | undefined;
      let uploadedFileName: string | undefined;
      let uploadedFileSize: number | undefined;

      // A. Jika ada lampiran media, unggah ke backend storage terlebih dahulu
      if (media) {
        setIsUploadingMedia(true);
        try {
          const uploadRes = await mediaApi.uploadMedia(
            media.uri,
            media.fileName,
            media.mimeType,
            media.base64
          );
          uploadedMediaUrl = uploadRes.url;
          uploadedFileName = uploadRes.file_name;
          uploadedFileSize = uploadRes.file_size;
        } catch (err: any) {
          console.error('[ChatScreen] Media upload failed:', err);
          Alert.alert(
            'Gagal Mengunggah Gambar',
            err.detail || err.message || 'Terjadi kesalahan saat mengunggah gambar ke server.'
          );
          setIsUploadingMedia(false);
          return;
        } finally {
          setIsUploadingMedia(false);
        }
      }

      // B. Enkripsi teks caption via AES-256-GCM jika percakapan direct chat
      let payloadToSend = trimmedText;
      let isEncrypted = false;

      if (isDirect && roomAESKeyRef.current && trimmedText) {
        try {
          payloadToSend = encryptText(roomAESKeyRef.current, trimmedText);
          isEncrypted = true;
        } catch (err) {
          console.error('[ChatScreen] Encryption failed, fallback to plaintext:', err);
        }
      }

      // Quoted Reply Context (if active)
      const replyPayload = replyingTo
        ? {
            id: replyingTo.id,
            nickname: replyingTo.nickname || replyingTo.from || (replyingTo.sender_id === currentUserId ? 'Anda' : title),
            content: replyingTo.media_type === 'audio'
              ? '🎙️ Pesan Suara'
              : replyingTo.media_url
              ? '📷 Foto'
              : replyingTo.content,
            media_url: replyingTo.media_url,
            media_type: replyingTo.media_type,
          }
        : undefined;

      // C. Render optimistic di timeline
      const optimisticMsg: Message = {
        id: tempId,
        room_id: roomId,
        sender_id: currentUserId,
        content: trimmedText,
        is_encrypted: isEncrypted,
        created_at: nowIso,
        timestamp: nowIso,
        status: 'sending',
        reply_to: replyPayload,
        media_url: media ? media.uri : undefined,
        media_type: media ? 'image' : undefined,
        file_name: uploadedFileName || media?.fileName,
        file_size: uploadedFileSize || media?.fileSize,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setStagedMedia(null);
      setReplyingTo(null);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);

      // D. Kirim pesan WebSocket lengkap dengan metadata media dan reply_to jika ada
      const mediaOptions = uploadedMediaUrl
        ? {
            media_url: uploadedMediaUrl,
            media_type: 'image',
            file_name: uploadedFileName,
            file_size: uploadedFileSize,
          }
        : undefined;

      const sent = websocketClient.sendMessage(
        roomId,
        payloadToSend,
        tempId,
        mediaOptions,
        replyPayload
      );
      if (!sent) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
      }
    },
    [roomId, currentUserId, isDirect, replyingTo, title]
  );

  // 4b. Handle Send Audio Voice Note (WhatsApp Store-and-Forward + Optimistic UI)
  const handleSendAudio = useCallback(
    async (uri: string, durationSeconds: number, fileSize?: number) => {
      if (!uri) return;

      const tempId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const nowIso = new Date().toISOString();
      const fileName = `voice_note_${Date.now()}.m4a`;

      // Quoted Reply Context (if active)
      const replyPayload = replyingTo
        ? {
            id: replyingTo.id,
            nickname: replyingTo.nickname || replyingTo.from || (replyingTo.sender_id === currentUserId ? 'Anda' : title),
            content: replyingTo.media_type === 'audio'
              ? '🎙️ Pesan Suara'
              : replyingTo.media_url
              ? '📷 Foto'
              : replyingTo.content,
            media_url: replyingTo.media_url,
            media_type: replyingTo.media_type,
          }
        : undefined;

      // A. Render optimistic audio bubble in timeline immediately (0ms)
      const optimisticMsg: Message = {
        id: tempId,
        room_id: roomId,
        sender_id: currentUserId,
        content: '',
        is_encrypted: false,
        created_at: nowIso,
        timestamp: nowIso,
        status: 'sending',
        reply_to: replyPayload,
        media_url: uri, // local uri so user can play their own voice note immediately
        media_type: 'audio',
        file_name: fileName,
        file_size: fileSize,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setReplyingTo(null);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);

      // B. Upload audio file to storage in background
      try {
        const uploadRes = await mediaApi.uploadMedia(uri, fileName, 'audio/m4a');

        // C. Send WebSocket message with uploaded remote URL
        const mediaOptions = {
          media_url: uploadRes.url,
          media_type: 'audio',
          file_name: uploadRes.file_name,
          file_size: uploadRes.file_size,
        };

        const sent = websocketClient.sendMessage(
          roomId,
          '',
          tempId,
          mediaOptions,
          replyPayload
        );

        if (sent) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    media_url: uploadRes.url,
                    file_name: uploadRes.file_name,
                    file_size: uploadRes.file_size,
                    status: 'sent',
                  }
                : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
          );
        }
      } catch (err: any) {
        console.error('[ChatScreen] Audio upload failed:', err);
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
        Alert.alert(
          'Gagal Mengunggah Pesan Suara',
          err.detail || err.message || 'Terjadi kesalahan saat mengunggah rekaman suara ke server.'
        );
      }
    },
    [roomId, currentUserId, replyingTo, title]
  );

  // 5. Handle Reaction on Message
  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      websocketClient.sendReaction(roomId, messageId, emoji);
    },
    [roomId]
  );

  // 6. Handle Delete Message (Delete for me vs Delete for everyone)
  const handleDeleteMessage = useCallback(
    async (messageId: string, type: 'for_me' | 'for_everyone') => {
      try {
        await messagesApi.deleteMessage(messageId, roomId, type);
        if (type === 'for_everyone') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, is_deleted: true, content: 'Pesan ini telah dihapus' }
                : m
            )
          );
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
      } catch (err: any) {
        console.warn('[ChatScreen] Delete message failed:', err);
        Alert.alert('Gagal Menghapus', err.detail || err.message || 'Tidak dapat menghapus pesan.');
      }
    },
    [roomId]
  );

  // 7. Handle Press Quote (Scroll to target message with highlight pulse)
  const handlePressQuote = useCallback(
    (targetMessageId: string) => {
      const index = messages.findIndex((m) => m.id === targetMessageId);
      if (index !== -1) {
        flatListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
        setHighlightedMessageId(targetMessageId);
        setTimeout(() => {
          setHighlightedMessageId(null);
        }, 1500);
      } else {
        Alert.alert('Pesan Tidak Ditemukan', 'Pesan asli mungkin berada di riwayat sebelumnya.');
      }
    },
    [messages]
  );

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
                {isDirect
                  ? `${roomAESKey ? '🔒 Terenkripsi E2EE • ' : ''}Terhubung (Online)`
                  : `${conversation.type === 'subgroup' ? 'Topik Forum' : 'Grup'}`}
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
                  senderName={item.from || item.nickname}
                  currentUserId={currentUserId}
                  isHighlighted={item.id === highlightedMessageId}
                  onMediaLoaded={handleMediaLoaded}
                  onReply={(msg) => setReplyingTo(msg)}
                  onLongPress={(msg) => setActionSheetMessage(msg)}
                  onPressQuote={handlePressQuote}
                  onReact={handleReact}
                />
              );
            }}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Chat Input Bar */}
        <ChatInputBar
          onSend={handleSendMessage}
          onSendAudio={handleSendAudio}
          disabled={isSending || isUploadingMedia}
          stagedMedia={stagedMedia}
          isUploading={isUploadingMedia}
          onPickCamera={handlePickCamera}
          onPickGallery={handlePickGallery}
          onCancelStagedMedia={handleCancelStagedMedia}
          replyTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </KeyboardAvoidingView>

      {/* Contextual Message Action Sheet (Reactions, Reply, Copy, Delete) */}
      <MessageActionSheet
        visible={Boolean(actionSheetMessage)}
        message={actionSheetMessage}
        isSelf={Boolean(
          actionSheetMessage &&
            (actionSheetMessage.sender_id === currentUserId ||
              (Boolean(user?.username) && actionSheetMessage.from === user?.username))
        )}
        onClose={() => setActionSheetMessage(null)}
        onReact={handleReact}
        onReply={(msg) => setReplyingTo(msg)}
        onDelete={handleDeleteMessage}
      />
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
