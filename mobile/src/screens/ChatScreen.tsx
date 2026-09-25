/**
 * WuzzChat ChatScreen Component
 * WhatsApp-grade chat timeline with sticky header, realtime WebSocket messaging,
 * optimistic updates, and Anti-Stale Reprocessing Guards.
 * Conforms to Mandatory Dual-Platform Frontend Architecture Rule.
 *
 * M-Mobile-8.2B: Ephemeral Sub-Group room support (fail-closed lock, breadcrumb)
 * M-Mobile-8.2C: Smart breadcrumb header UX & Forum button
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Conversation, ConversationItem, GroupDetails, Message, PinnedMessage } from '../api/types';
import { getUserPublicKey } from '../api/users';
import { groupsApi } from '../api/groups';
import { mediaApi } from '../api/media';
import { messagesApi } from '../api/messages';
import { websocketClient } from '../services/websocket';
import { mediaCache } from '../services/mediaCache';
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
import { SubGroupListModal } from '../components/SubGroupListModal';
import { GroupPreviewModal } from '../components/GroupPreviewModal';
import { AuthorizationShield } from '../components/AuthorizationShield';
import { ForwardMessageModal } from '../components/ForwardMessageModal';
import { PinnedMessagesBanner } from '../components/PinnedMessagesBanner';
import { ContactInfoModal } from '../components/ContactInfoModal';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface ChatScreenProps {
  conversation: ConversationItem;
  onBack: () => void;
  onOpenGroupInfo?: (group: GroupDetails | ConversationItem) => void;
  /**
   * M-Mobile-8.2C: Called when user taps the breadcrumb or back from a sub-group
   * to navigate to the parent group conversation.
   */
  onNavigateToParent?: (parentGroupId: string) => void;
  /**
   * M-Mobile-8.2B: Parent group conversation (provided when entering a sub-group).
   * Used to fetch parent info for breadcrumb display.
   */
  parentGroupConversation?: ConversationItem | null;
  /** M-Mobile-8.2B: Directly enter a sub-group conversation from the forum modal */
  onEnterSubGroup?: (subConv: Conversation) => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  conversation,
  onBack,
  onOpenGroupInfo,
  onNavigateToParent,
  parentGroupConversation,
  onEnterSubGroup,
}) => {

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
  const [memberCount, setMemberCount] = useState<number>(conversation.member_count || 0);
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);

  // Milestone 8.3: Message Management Suite States
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [isForwardModalVisible, setIsForwardModalVisible] = useState<boolean>(false);
  const [pinnedMessages, setPinnedMessages] = useState<Array<Message | PinnedMessage>>([]);

  // In-Chat Search States
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(0);
  const [isSearchLoading, setIsSearchLoading] = useState<boolean>(false);
  const searchTimerRef = useRef<any>(null);

  // DEC-013: Authorization Shield State (403 Forbidden interceptor)
  const [isAccessDenied, setIsAccessDenied] = useState<boolean>(false);
  const [accessDeniedError, setAccessDeniedError] = useState<string | null>(null);

  // DEC-012: Direct Link Public Group Preview State
  const [directPreviewGroup, setDirectPreviewGroup] = useState<GroupDetails | null>(null);

  const roomId = conversation.id;
  const currentUserId = user?.id || '';

  // Derived: room type flags (immutable ID-based checks — DEC-008)
  const isSubGroup =
    typeof conversation.id === 'string' && conversation.id.startsWith('sub_');
  const isParentGroup =
    typeof conversation.id === 'string' && conversation.id.startsWith('grp_');
  const isGroup =
    conversation.is_group === true ||
    conversation.type === 'group' ||
    conversation.type === 'subgroup' ||
    isParentGroup ||
    isSubGroup;
  const isDirect = !isGroup;

  // Pre-flight check state for groups (suppress premature websocket join & timers)
  const [isVerifyingGroup, setIsVerifyingGroup] = useState<boolean>(isGroup);

  // M-Mobile-8.2B: Sub-group / forum topic state
  const [parentGroupDetails, setParentGroupDetails] = useState<GroupDetails | null>(null);
  const [showForumModal, setShowForumModal] = useState(false);

  // Milestone M-Mobile-8.5: Contact Profile & Verified Identity modal
  const [showContactInfoModal, setShowContactInfoModal] = useState(false);
  const [peerPublicKey, setPeerPublicKey] = useState<string | undefined>(conversation.peer_public_key);

  const flatListRef = useRef<FlatList>(null);
  const lastHandledMsgIdRef = useRef<string | null>(null);
  const roomAESKeyRef = useRef<Uint8Array | null>(null);

  // Fail-Closed: a forum topic is locked if expired
  const isForumExpired = useMemo(() => {
    if (!isSubGroup) return false;
    const details = groupDetails as any;
    if (details?.status === 'expired') return true;
    if (details?.expires_at) {
      return new Date(details.expires_at).getTime() <= Date.now();
    }
    return false;
  }, [isSubGroup, groupDetails]);

  const title =
    groupDetails?.title || conversation.title || conversation.peer_nickname || 'Obrolan';
  const avatarUrl =
    groupDetails?.avatar_url || conversation.avatar_url || conversation.peer_avatar_url;

  // Milestone M-Mobile-8.5: Deterministic peer resolution for 1-on-1 direct chat
  const resolvedPeerId = useMemo(() => {
    if (conversation.peer_id) return conversation.peer_id;
    if (roomId.startsWith('dm_')) {
      const parts = roomId.replace(/^dm_/, '').split('_');
      return parts[0] === currentUserId ? parts[1] : parts[0];
    }
    if (conversation.participants?.length) {
      const other = conversation.participants.find((p) => p.id !== currentUserId);
      return other?.id || '';
    }
    return '';
  }, [conversation.peer_id, conversation.participants, roomId, currentUserId]);

  // Breadcrumb parent name (M-Mobile-8.2C)
  const parentGroupName = useMemo(() => {
    if (!isSubGroup) return null;
    return (
      parentGroupDetails?.title ||
      parentGroupConversation?.title ||
      parentGroupConversation?.name ||
      null
    );
  }, [isSubGroup, parentGroupDetails, parentGroupConversation]);

  // Load & verify group details if group room
  useEffect(() => {
    if (!isGroup) {
      setIsVerifyingGroup(false);
      return;
    }
    let mounted = true;
    setIsVerifyingGroup(true);

    groupsApi
      .getGroupDetails(roomId)
      .then((details) => {
        if (!mounted) return;
        if (details) {
          setGroupDetails(details);
          if (details.member_count) {
            setMemberCount(details.member_count);
          }

          // DEC-012: If group is public and current user is not a member yet, show preview modal
          const isUserMember = Boolean(details.my_role || (details as any).is_member);
          if (details.is_public && !isUserMember) {
            console.log('[ChatScreen] Direct link to unjoined public group -> show preview modal');
            setDirectPreviewGroup(details);
          }
        }
        setIsVerifyingGroup(false);
      })
      .catch((err: any) => {
        if (!mounted) return;
        console.warn('[ChatScreen] Could not fetch group details:', err);

        // DEC-013: 403 Forbidden Gatekeeper & Authorization Shield
        const isForbidden =
          err?.status === 403 ||
          (err?.detail && err.detail.toLowerCase().includes('akses ditolak')) ||
          (err?.detail && err.detail.toLowerCase().includes('bukan anggota')) ||
          (err?.message && err.message.toLowerCase().includes('akses ditolak')) ||
          (err?.message && err.message.toLowerCase().includes('bukan anggota'));

        if (isForbidden) {
          setIsAccessDenied(true);
          setAccessDeniedError(err?.detail || err?.message || 'Akses ditolak: Anda bukan anggota grup ini');
        } else {
          Alert.alert('Gagal Memuat Grup', err?.detail || err?.message || 'Grup tidak dapat diakses.');
          onBack();
        }
        setIsVerifyingGroup(false);
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isGroup, roomId, onBack]);

  // M-Mobile-8.2C: Fetch parent group info for breadcrumb when in a sub-group
  useEffect(() => {
    if (!isSubGroup) return;

    // Try from groupDetails.parent_id (populated after group detail fetch)
    const parentId =
      (groupDetails as any)?.parent_id ||
      conversation.parent_id ||
      parentGroupConversation?.id;

    if (!parentId) return;
    let mounted = true;

    groupsApi
      .getGroupDetails(parentId)
      .then((details) => {
        if (mounted && details) setParentGroupDetails(details);
      })
      .catch((err) => {
        console.log('[ChatScreen] Could not fetch parent group details:', err);
      });

    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubGroup, (groupDetails as any)?.parent_id, parentGroupConversation?.id]);


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

      if (peerPubKey && mounted) {
        setPeerPublicKey(peerPubKey);
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

  // 0C. Fetch initial pinned messages for this room
  useEffect(() => {
    if (isVerifyingGroup || isAccessDenied || directPreviewGroup) return;

    let mounted = true;
    messagesApi
      .getPinnedMessages(roomId)
      .then((pins) => {
        if (!mounted || !pins) return;
        setPinnedMessages(pins);
      })
      .catch((err) => {
        console.warn('[ChatScreen] Could not fetch pinned messages:', err);
      });

    return () => {
      mounted = false;
    };
  }, [roomId, isVerifyingGroup, isAccessDenied, directPreviewGroup]);

  // 1. Load History & Join Room on Mount (Clean History State Sync via WebSocket)
  useEffect(() => {
    // DEC-013 / DEC-012: Suppress WebSocket join & false timeout if:
    // 1. Still verifying group pre-flight
    // 2. Access is denied (HTTP 403 Forbidden)
    // 3. Waiting for public group preview confirmation
    if (isVerifyingGroup || isAccessDenied || directPreviewGroup) {
      return;
    }

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
  }, [roomId, isVerifyingGroup, isAccessDenied, directPreviewGroup]);

  // 2. Realtime WebSocket Listeners (Anti-Stale Reprocessing Guard)
  useEffect(() => {
    if (isAccessDenied) return;

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

    // F. Message Edited Listener
    const unsubscribeEdited = websocketClient.on('message_edited', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom && targetRoom !== roomId) return;

      const targetId = data.id || data.message_id;
      if (targetId) {
        let content = data.content || '';
        if (isEncryptedMessage(content) && roomAESKeyRef.current) {
          try {
            content = decryptText(roomAESKeyRef.current, content);
          } catch {}
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === targetId
              ? {
                  ...m,
                  content,
                  is_edited: true,
                  edited_at: data.edited_at || new Date().toISOString(),
                }
              : m
          )
        );
      }
    });

    // G. Message Pinned Listener
    const unsubscribePinned = websocketClient.on('message_pinned', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom && targetRoom !== roomId) return;

      const targetId = data.id || data.message_id;
      if (targetId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === targetId ? { ...m, is_pinned: true } : m))
        );
        messagesApi
          .getPinnedMessages(roomId)
          .then((pins) => {
            if (pins) {
              setPinnedMessages(pins);
            }
          })
          .catch(() => {});
      }
    });

    // H. Message Unpinned Listener
    const unsubscribeUnpinned = websocketClient.on('message_unpinned', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom && targetRoom !== roomId) return;

      const targetId = data.id || data.message_id;
      if (targetId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === targetId ? { ...m, is_pinned: false } : m))
        );
        setPinnedMessages((prev) =>
          prev.filter((p: any) => (p.message_id || p.id) !== targetId)
        );
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeAck();
      unsubscribeReceipt();
      unsubscribeReaction();
      unsubscribeDeleted();
      unsubscribeEdited();
      unsubscribePinned();
      unsubscribeUnpinned();
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
        // DEC-034: Ensure received media is cached locally before or while sending ACK
        if (msg.media_url && !msg.media_url.startsWith('file://')) {
          mediaCache.ensureMediaCached(msg.media_url, msg.id, msg.file_name).catch((cacheErr) => {
            console.warn('[ChatScreen] Failed to cache received media:', cacheErr);
          });
        }
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

          // DEC-034: Persist local copy of uploaded media to cache so sender never loses it
          mediaCache.saveLocalFileToCache(media.uri, tempId, uploadedMediaUrl, uploadedFileName).catch((cacheErr) => {
            console.warn('[ChatScreen] Failed to cache sent media:', cacheErr);
          });
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

        // DEC-034: Persist local copy of sent voice note to cache
        mediaCache.saveLocalFileToCache(uri, tempId, uploadRes.url, uploadRes.file_name).catch((cacheErr) => {
          console.warn('[ChatScreen] Failed to cache sent voice note:', cacheErr);
        });

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

  // 8. Milestone 8.3: Edit Message Handlers
  const handleStartEdit = useCallback((message: Message) => {
    setReplyingTo(null);
    setEditingMessage(message);
  }, []);

  const handleSaveEdit = useCallback(
    async (messageId: string, newContent: string) => {
      setEditingMessage(null);

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: newContent,
                is_edited: true,
                edited_at: new Date().toISOString(),
              }
            : m
        )
      );

      try {
        let payloadContent = newContent;
        if (roomAESKeyRef.current && isDirect) {
          payloadContent = encryptText(roomAESKeyRef.current, newContent);
        }
        await messagesApi.editMessage(messageId, payloadContent, roomId);
      } catch (err: any) {
        console.error('[ChatScreen] Edit message failed:', err);
        Alert.alert(
          'Gagal Mengedit Pesan',
          err?.message || 'Batas waktu edit (15 menit) telah lewat atau server bermasalah.'
        );
      }
    },
    [roomId, isDirect]
  );

  // 9. Milestone 8.3: Forward Message Handlers
  const handleStartForward = useCallback((message: Message) => {
    setForwardingMessage(message);
    setIsForwardModalVisible(true);
  }, []);

  const handleSendForward = useCallback(
    async (targetRoomIds: string[], msg: Message) => {
      // Pass decrypted plaintext so cross-room recipients can read it without key mismatch
      const plaintextContent = msg.content;
      await messagesApi.forwardMessage(msg.id, targetRoomIds, plaintextContent);
      Alert.alert('Terkirim', `Pesan berhasil diteruskan ke ${targetRoomIds.length} obrolan.`);
    },
    []
  );

  // 10. Milestone 8.3: Pin Message Handlers
  const handleTogglePin = useCallback(
    async (message: Message) => {
      const isPinned = Boolean(message.is_pinned);
      const targetId = message.id;

      // Optimistic update in messages
      setMessages((prev) =>
        prev.map((m) => (m.id === targetId ? { ...m, is_pinned: !isPinned } : m))
      );

      try {
        if (isPinned) {
          setPinnedMessages((prev) =>
            prev.filter((p: any) => (p.message_id || p.id) !== targetId)
          );
          await messagesApi.unpinMessage(targetId, roomId);
        } else {
          await messagesApi.pinMessage(targetId, roomId);
          const updatedPins = await messagesApi.getPinnedMessages(roomId);
          if (updatedPins) {
            setPinnedMessages(updatedPins);
          }
        }
      } catch (err: any) {
        console.error('[ChatScreen] Pin toggle failed:', err);
        // Rollback optimistic update
        setMessages((prev) =>
          prev.map((m) => (m.id === targetId ? { ...m, is_pinned: isPinned } : m))
        );
        Alert.alert('Gagal', err?.detail || err?.message || 'Gagal mengubah status sematan pesan.');
      }
    },
    [roomId]
  );

  const handleUnpinMessage = useCallback(
    async (item: Message | PinnedMessage) => {
      const targetId = (item as PinnedMessage).message_id || (item as Message).id;
      if (!targetId) return;

      setPinnedMessages((prev) =>
        prev.filter((p: any) => (p.message_id || p.id) !== targetId)
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === targetId ? { ...m, is_pinned: false } : m))
      );

      try {
        await messagesApi.unpinMessage(targetId, roomId);
      } catch (err: any) {
        console.error('[ChatScreen] Unpin message failed:', err);
        Alert.alert('Gagal', err?.detail || err?.message || 'Gagal melepas sematan pesan.');
      }
    },
    [roomId]
  );

  // Milestone 8.3: Enriched Pinned Messages for preview and jump-to
  const enrichedPinnedMessages = useMemo(() => {
    return pinnedMessages.map((pin: any) => {
      const msgId = pin.message_id || pin.id;
      const matchedMsg = messages.find((m) => m.id === msgId);
      if (matchedMsg) {
        return {
          ...pin,
          message: matchedMsg,
          nickname: matchedMsg.nickname || matchedMsg.from,
          content: matchedMsg.content,
          media_type: matchedMsg.media_type,
          media_url: matchedMsg.media_url,
        };
      }
      return pin;
    });
  }, [pinnedMessages, messages]);

  const handleJumpToMessage = useCallback(
    (messageId: string) => {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index !== -1 && flatListRef.current) {
        try {
          flatListRef.current.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.5,
          });
        } catch {
          flatListRef.current.scrollToOffset({
            offset: Math.max(0, index * 75),
            animated: true,
          });
        }
        setHighlightedMessageId(messageId);
        setTimeout(() => {
          setHighlightedMessageId(null);
        }, 2000);
      } else {
        Alert.alert('Pesan Tidak Ditemukan', 'Pesan mungkin berada di riwayat sebelumnya.');
      }
    },
    [messages]
  );

  // 11. Milestone 8.3: In-Chat Search Handlers
  const handleStartSearch = useCallback(() => {
    setIsSearching(true);
    setSearchQuery('');
    setSearchResults([]);
    setCurrentSearchIndex(0);
  }, []);

  const handleCloseSearch = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setCurrentSearchIndex(0);
    setHighlightedMessageId(null);
  }, []);

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      if (!query.trim()) {
        setSearchResults([]);
        setCurrentSearchIndex(0);
        return;
      }

      searchTimerRef.current = setTimeout(async () => {
        setIsSearchLoading(true);
        try {
          const results = await messagesApi.searchMessages(roomId, query.trim());
          const decResults = (results || []).map((r) => {
            if (isEncryptedMessage(r.content) && roomAESKeyRef.current) {
              try {
                return {
                  ...r,
                  content: decryptText(roomAESKeyRef.current, r.content),
                  is_encrypted: true,
                };
              } catch {
                return r;
              }
            }
            return r;
          });
          setSearchResults(decResults);
          setCurrentSearchIndex(0);
          if (decResults.length > 0) {
            handleJumpToMessage(decResults[0].id);
          }
        } catch (err) {
          console.warn('[ChatScreen] Search failed:', err);
        } finally {
          setIsSearchLoading(false);
        }
      }, 300);
    },
    [roomId, handleJumpToMessage]
  );

  const handleSearchPrev = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    handleJumpToMessage(searchResults[newIndex].id);
  }, [searchResults, currentSearchIndex, handleJumpToMessage]);

  const handleSearchNext = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    handleJumpToMessage(searchResults[newIndex].id);
  }, [searchResults, currentSearchIndex, handleJumpToMessage]);

  // DEC-013: Render Authorization Shield if access is denied (403 Forbidden)
  if (isAccessDenied) {
    return (
      <AuthorizationShield
        onBack={onBack}
        errorDetail={accessDeniedError || undefined}
        groupId={roomId}
      />
    );
  }

  // Pre-flight group verification indicator
  if (isGroup && isVerifyingGroup) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sticky Header — with In-Chat Search mode toggle and Sub-Group breadcrumb */}
        {isSearching ? (
          <View style={styles.searchHeaderBar}>
            <TouchableOpacity
              style={styles.searchHeaderBackBtn}
              onPress={handleCloseSearch}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Text style={styles.searchHeaderBackIcon}>←</Text>
            </TouchableOpacity>

            <View style={styles.searchHeaderInputContainer}>
              <TextInput
                style={styles.searchHeaderInput}
                placeholder="Cari pesan dalam obrolan..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={handleSearchQueryChange}
                autoFocus
                autoCorrect={false}
              />
              {isSearchLoading ? (
                <ActivityIndicator size="small" color={colors.accentPrimary} style={{ marginRight: 6 }} />
              ) : searchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => handleSearchQueryChange('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.searchClearIcon}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {searchResults.length > 0 && (
              <View style={styles.searchNavCol}>
                <Text style={styles.searchCounterText}>
                  {currentSearchIndex + 1}/{searchResults.length}
                </Text>
                <View style={styles.searchNavButtons}>
                  <TouchableOpacity
                    style={styles.searchNavBtn}
                    onPress={handleSearchPrev}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.searchNavIcon}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.searchNavBtn}
                    onPress={handleSearchNext}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.searchNavIcon}>▼</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.header, isSubGroup && styles.headerTall]}>
            {/* Back button: sub-group → navigate to parent group first */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (isSubGroup && onNavigateToParent) {
                  const parentId =
                    (groupDetails as any)?.parent_id ||
                    conversation.parent_id ||
                    parentGroupConversation?.id;
                  if (parentId) {
                    onNavigateToParent(parentId);
                    return;
                  }
                }
                onBack();
              }}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              activeOpacity={0.7}
            >
              <Text style={styles.backIcon}>←</Text>
            </TouchableOpacity>

            {/* Center: avatar + title + subtitle/breadcrumb */}
            <TouchableOpacity
              style={styles.headerInfoTouchable}
              onPress={() => {
                if (isSubGroup) {
                  // Tap header in sub-group → navigate to parent (breadcrumb)
                  const parentId =
                    (groupDetails as any)?.parent_id ||
                    conversation.parent_id ||
                    parentGroupConversation?.id;
                  if (parentId && onNavigateToParent) onNavigateToParent(parentId);
                } else if (isGroup && onOpenGroupInfo) {
                  onOpenGroupInfo(groupDetails || conversation);
                } else if (isDirect && resolvedPeerId) {
                  setShowContactInfoModal(true);
                }
              }}
              disabled={!isGroup && !isDirect}
              activeOpacity={isGroup || isDirect ? 0.75 : 1}
            >
              <View style={styles.headerAvatarContainer}>
                <Avatar
                  name={title}
                  avatarUrl={avatarUrl}
                  size={38}
                  isGroup={isGroup}
                  isOnline={isDirect}
                />
              </View>

              <View style={styles.headerInfo}>
                <View style={styles.headerTitleContainer}>
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {isDirect && conversation.peer_is_verified && (
                    <VerifiedBadge size={14} />
                  )}
                </View>
                <View style={styles.headerStatusRow}>
                  {isDirect && <View style={styles.onlineDot} />}

                  {/* M-Mobile-8.2C: Interactive breadcrumb for sub-group rooms */}
                  {isSubGroup ? (
                    <Text style={styles.headerBreadcrumb} numberOfLines={1}>
                      {'↖ '}
                      {parentGroupName ? `${parentGroupName} • ` : ''}
                      {'Forum'}
                      {memberCount > 0 ? ` • ${memberCount} anggota` : ''}
                    </Text>
                  ) : (
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                      {isDirect
                        ? `${roomAESKey ? '🔒 Terenkripsi E2EE • ' : ''}Terhubung (Online)`
                        : `${memberCount > 0 ? `${memberCount} anggota` : 'Grup'}`}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>

            {/* Right-side buttons */}
            <View style={styles.headerRightActions}>
              {/* In-Chat Search Button */}
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={handleStartSearch}
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                activeOpacity={0.75}
              >
                <Text style={styles.headerIconText}>🔍</Text>
              </TouchableOpacity>

              {isParentGroup && (
                // 🏛️ Forum button — only on parent groups, not sub-groups
                <TouchableOpacity
                  style={styles.forumButton}
                  onPress={() => setShowForumModal(true)}
                  hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.forumButtonText}>🏛️</Text>
                </TouchableOpacity>
              )}

              {isGroup && !isSubGroup && onOpenGroupInfo && (
                <TouchableOpacity
                  style={styles.groupInfoButton}
                  onPress={() => onOpenGroupInfo(groupDetails || conversation)}
                  hitSlop={{ top: 12, bottom: 12, left: 6, right: 12 }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.groupInfoIcon}>ℹ️</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Milestone 8.3: Pinned Messages Banner */}
        <PinnedMessagesBanner
          pinnedMessages={enrichedPinnedMessages}
          onJumpToMessage={handleJumpToMessage}
          onUnpinMessage={handleUnpinMessage}
          canUnpin={true}
        />

        {/* M-Mobile-8.2B: Fail-Closed Read-Only Banner for expired forum topics */}
        {isForumExpired && (
          <View style={styles.expiredBanner}>
            <Text style={styles.expiredBannerText}>
              🔒 Topik forum ini telah kedaluwarsa dan terkunci. Riwayat pesan tetap dapat dibaca.
            </Text>
          </View>
        )}

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
                item.from === currentUserId ||
                (Boolean(user?.username) && item.from === user?.username);

              return (
                <MessageBubble
                  message={item}
                  isSelf={isSelf}
                  showSenderName={!isDirect && !isSelf}
                  senderName={item.nickname || item.from}
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

        {/* Chat Input Bar — disabled when forum topic is expired (Fail-Closed Lock) */}
        <ChatInputBar
          onSend={handleSendMessage}
          onSendAudio={handleSendAudio}
          disabled={isSending || isUploadingMedia || isForumExpired}
          stagedMedia={stagedMedia}
          isUploading={isUploadingMedia}
          onPickCamera={isForumExpired ? undefined : handlePickCamera}
          onPickGallery={isForumExpired ? undefined : handlePickGallery}
          onCancelStagedMedia={handleCancelStagedMedia}
          replyTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          editingMessage={editingMessage}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={() => setEditingMessage(null)}
        />
      </KeyboardAvoidingView>

      {/* Contextual Message Action Sheet (Reactions, Reply, Edit, Forward, Pin, Copy, Delete) */}
      <MessageActionSheet
        visible={Boolean(actionSheetMessage)}
        message={actionSheetMessage}
        isSelf={Boolean(
          actionSheetMessage &&
            (actionSheetMessage.sender_id === currentUserId ||
              actionSheetMessage.from === currentUserId ||
              (Boolean(user?.username) && actionSheetMessage.from === user?.username))
        )}
        onClose={() => setActionSheetMessage(null)}
        onReact={handleReact}
        onReply={(msg) => setReplyingTo(msg)}
        onEdit={handleStartEdit}
        onForward={handleStartForward}
        onTogglePin={handleTogglePin}
        onDelete={handleDeleteMessage}
      />

      {/* Milestone 8.3: Forward Message Modal */}
      <ForwardMessageModal
        visible={isForwardModalVisible}
        message={forwardingMessage}
        currentRoomId={roomId}
        onClose={() => {
          setIsForwardModalVisible(false);
          setForwardingMessage(null);
        }}
        onForward={handleSendForward}
      />

      {/* M-Mobile-8.2B: Forum Topics Drawer (parent group only) */}
      {isParentGroup && showForumModal && (
        <SubGroupListModal
          visible={showForumModal}
          parentGroupId={roomId}
          parentGroupTitle={title}
          currentUserRole={groupDetails?.my_role}
          currentUserId={currentUserId}
          onClose={() => setShowForumModal(false)}
          onEnterSubGroup={(subConv) => {
            setShowForumModal(false);
            if (onEnterSubGroup) {
              onEnterSubGroup(subConv);
            } else if (onOpenGroupInfo) {
              onOpenGroupInfo(subConv as unknown as ConversationItem);
            }
          }}
        />
      )}

      {/* DEC-012: Direct Link Public Group Preview Confirmation Modal */}
      {directPreviewGroup ? (
        <GroupPreviewModal
          visible={Boolean(directPreviewGroup)}
          group={directPreviewGroup}
          onClose={onBack}
          onJoined={(joinedGroup) => {
            setGroupDetails(joinedGroup);
            setDirectPreviewGroup(null);
          }}
        />
      ) : null}

      {/* Milestone M-Mobile-8.5: Contact Profile & E2EE Safety Number Verification Modal */}
      {isDirect && (
        <ContactInfoModal
          visible={showContactInfoModal}
          onClose={() => setShowContactInfoModal(false)}
          userId={resolvedPeerId}
          currentUserId={currentUserId}
          initialDisplayName={conversation.peer_nickname || title}
          initialAvatarUrl={avatarUrl}
          initialUsername={conversation.peer_nickname}
          initialIsVerified={conversation.peer_is_verified}
          peerPublicKeyJWK={peerPublicKey || conversation.peer_public_key}
          myPublicKeyJWK={e2eeKeyPair?.publicKeyJWK}
          isOnline={true}
        />
      )}
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
  // M-Mobile-8.2C: taller header to accommodate 2-line breadcrumb
  headerTall: {
    height: 64,
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
  headerInfoTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatarContainer: {
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  groupInfoButton: {
    padding: 8,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfoIcon: {
    fontSize: 20,
  },
  // M-Mobile-8.2C: 🏛️ Forum quick-access button in parent group header
  forumButton: {
    padding: 8,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forumButtonText: {
    fontSize: 20,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  // M-Mobile-8.2C: Interactive breadcrumb line in sub-group header
  headerBreadcrumb: {
    fontSize: 12,
    color: colors.accentPrimary,
    fontWeight: '500',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerIconButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: {
    fontSize: 18,
  },
  searchHeaderBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    zIndex: 50,
  },
  searchHeaderBackBtn: {
    padding: 8,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchHeaderBackIcon: {
    fontSize: 20,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  searchHeaderInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgBase,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  searchHeaderInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchClearIcon: {
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: 4,
  },
  searchNavCol: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 6,
  },
  searchCounterText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  searchNavButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  searchNavBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchNavIcon: {
    fontSize: 11,
    color: colors.textPrimary,
  },
  // M-Mobile-8.2B: Fail-Closed expired banner
  expiredBanner: {
    backgroundColor: colors.tintError10,
    borderBottomWidth: 1,
    borderBottomColor: colors.colorError,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  expiredBannerText: {
    fontSize: 12,
    color: colors.colorError,
    fontWeight: '600',
    textAlign: 'center',
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
