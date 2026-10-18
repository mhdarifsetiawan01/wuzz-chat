import { Button } from '../components/Button';
import { SourceRequest, SOURCE_UNAVAILABLE } from '../services/sourceMessage';
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
  TextInput,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { normalizeReactions, Conversation, FeedPost, ConversationItem, GroupDetails, GroupMember, Message, PinnedMessage, ConnectionStatusResponse } from '../api/types';
import { getUserPublicKey } from '../api/users';
import { groupsApi } from '../api/groups';
import { mediaApi } from '../api/media';
import { messagesApi } from '../api/messages';
import { websocketClient } from '../services/websocket';
import { mediaCache } from '../services/mediaCache';
import { acknowledgeCachedMedia } from '../services/mediaReceipt';
import { useAuth, useCall, useConversations, useMessageActions, useRoomMessages } from '../context';
import { useConnection } from '../context/ConnectionContext';
import {
  deriveRoomAESKey,
  cachePeerPublicKey,
  getCachedPeerPublicKey,
  encryptText,
  decryptText,
  isEncryptedMessage,
  extractDMPeerId,
} from '../services/crypto';
import { ensureRoomAESKey } from '../services/roomKeyStore';
import { Avatar } from '../components/Avatar';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInputBar, StagedMedia } from '../components/ChatInputBar';
import { prepareVideo, VideoPrepError, VIDEO_MAX_DURATION_SEC } from '../services/videoPrep';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { ReportModal, ReportTarget } from '../components/ReportModal';
import { SubGroupListModal } from '../components/SubGroupListModal';
import { GroupPreviewModal } from '../components/GroupPreviewModal';
import { AuthorizationShield } from '../components/AuthorizationShield';
import { ForwardMessageModal } from '../components/ForwardMessageModal';
import { PinnedMessagesBanner } from '../components/PinnedMessagesBanner';
import { ChatMediaGalleryModal } from '../components/ChatMediaGalleryModal';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { PrivateAccountNoticeModal } from '../components/PrivateAccountNoticeModal';
import { useTheme, useThemedStyles, ColorTokens } from '../theme';
import { IconText } from '../components/IconText';
import { Icon } from '../components/Icon';
import { radius, spacing } from '../theme/spacing';
import { quotePreviewText } from '../utils/quotePreview';
import { dayKey } from '../utils/dayLabel';
import { DateSeparator } from '../components/DateSeparator';
import { SystemMessageRow } from '../components/SystemMessageRow';
import { ChatHeaderStatus } from '../components/ChatHeaderStatus';
import { shouldSendTyping } from '../utils/typingTracker';
import { isSystemMessage } from '../utils/systemMessage';
import { showAlert } from '../services/dialog';

export interface ChatScreenProps {
  sourceMessageId?: string;
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
  /** Panah kembali header topik langsung memanggil onBack (bukan ke grup induk); dipakai bila dibuka dari Bubble Forum. */
  backToOrigin?: boolean;
  /** M-Mobile-8.2B: Directly enter a sub-group conversation from the forum modal */
  onEnterSubGroup?: (subConv: Conversation) => void;
  /** Opens UserProfileScreen for the direct chat peer */
  onOpenUserProfile?: (userId: string, username?: string) => void;
  /** Opens PostReader for a feed post shared into the chat */
  onOpenPost?: (postId: string, post?: FeedPost) => void;
}

// Cache anggota untuk @mention per room: TTL 5 menit, satu request berjalan per room, jeda 60 dtk setelah gagal
const MENTION_MEMBERS_TTL_MS = 5 * 60 * 1000;
const MENTION_MEMBERS_RETRY_MS = 60 * 1000;
const mentionMembersCache = new Map<string, { at: number; members: GroupMember[] }>();
const mentionMembersInFlight = new Map<string, Promise<GroupMember[] | null>>();
const mentionMembersFailedAt = new Map<string, number>();

function loadMentionMembers(roomId: string): Promise<GroupMember[] | null> {
  const cached = mentionMembersCache.get(roomId);
  if (cached && Date.now() - cached.at < MENTION_MEMBERS_TTL_MS) return Promise.resolve(cached.members);
  const failedAt = mentionMembersFailedAt.get(roomId);
  if (failedAt && Date.now() - failedAt < MENTION_MEMBERS_RETRY_MS) return Promise.resolve(null);
  const pending = mentionMembersInFlight.get(roomId);
  if (pending) return pending;
  const task = groupsApi
    .getGroupMembers(roomId)
    .then((res) => {
      const list: GroupMember[] = Array.isArray(res) ? res : (res as any)?.members ?? [];
      mentionMembersCache.set(roomId, { at: Date.now(), members: list });
      mentionMembersFailedAt.delete(roomId);
      return list;
    })
    .catch(() => {
      mentionMembersFailedAt.set(roomId, Date.now());
      return null;
    })
    .finally(() => {
      mentionMembersInFlight.delete(roomId);
    });
  mentionMembersInFlight.set(roomId, task);
  return task;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  conversation,
  sourceMessageId,
  onBack,
  onOpenGroupInfo,
  onNavigateToParent,
  parentGroupConversation,
  backToOrigin = false,
  onEnterSubGroup,
  onOpenUserProfile,
  onOpenPost,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const insets = useSafeAreaInsets();
  const { user, token, e2eeKeyPair } = useAuth();
  const { startCall } = useCall();
  const { markConversationAsRead, setActiveRoomId } = useConversations();
  const { checkConnectionStatus, sendFriendRequest } = useConnection();

  const [peerConnStatus, setPeerConnStatus] = useState<ConnectionStatusResponse | null>(null);
  const [showPrivateNoticeModal, setShowPrivateNoticeModal] = useState<boolean>(false);
  const [isAddingFriend, setIsAddingFriend] = useState<boolean>(false);

  const roomId = conversation.id;

  // Register active room and optimistically reset unread count (M-Mobile-8.23)
  useEffect(() => {
    if (roomId) {
      setActiveRoomId(roomId);
      markConversationAsRead(roomId);
    }
    return () => {
      setActiveRoomId(null);
    };
  }, [roomId, markConversationAsRead, setActiveRoomId]);

  // Aksi stabil (tidak memicu render); data reaktif hanya untuk room ini lewat useRoomMessages
  const {
    getRoomMessages,
    hydrateRoomFromLocalDB,
    setRoomMessages,
    removeMessage,
    updateMessage,
    markRoomLoading,
    hasMoreOlderMessages,
    isLoadingOlderMessages,
    loadOlderMessages,
    getRoomAESKey,
  } = useMessageActions();

  const {
    messages: latestMessages,
    isLoading: latestLoading,
    hasMoreOlder: roomHasMoreOlder,
    isLoadingOlder: roomIsLoadingOlder,
  } = useRoomMessages(roomId);

  const [sourceData, setSourceData] = useState<{room: string; session: string | null; rows: Message[]} | null>(null);
  const sourceWindow = sourceData?.room === roomId && sourceData.session === token ? sourceData.rows : null;
  const setSourceWindow = useCallback((update: Message[] | null | ((prev: Message[] | null) => Message[] | null)) => {
    setSourceData(prev => {
      const rows = typeof update === 'function' ? update(prev?.room === roomId && prev.session === token ? prev.rows : null) : update;
      return rows ? { room: roomId, session: token, rows } : null;
    });
  }, [roomId, token]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [sourceDismissed, setSourceDismissed] = useState(false);
  const messages = sourceWindow ?? latestMessages;
  const sourceModeRef = useRef(false);
  sourceModeRef.current = !!sourceMessageId && !sourceDismissed;
  const isLoading = sourceLoading || (!sourceWindow && latestLoading);
  useEffect(() => {
    setSourceDismissed(false);
  }, [roomId, sourceMessageId, token]);
  useEffect(() => {
    setSourceWindow(null);
    setSourceError('');
    if (!sourceMessageId || sourceDismissed) { setSourceLoading(false); return; }
    const request = new SourceRequest();
    setSourceLoading(true);
    void request.run(signal => messagesApi.getSourceContext(roomId, sourceMessageId, signal)).then(result => {
      if (!result) return;
      setSourceLoading(false);
      if ('error' in result) setSourceError(result.error);
      else setSourceWindow(result.value);
    });
    return () => request.cancel();
  }, [roomId, sourceMessageId, token, sourceAttempt, sourceDismissed]);

  useEffect(() => {
    const update = (kind: 'delete' | 'edit' | 'reaction', data: any) => {
      if ((data.room || data.room_id) !== roomId) return;
      const id = data.id || data.message_id;
      setSourceWindow(prev => {
        if (!prev) return null;
        if (kind === 'delete' && (data.delete_type === 'for_me' || data.delete_for_me)) return prev.filter(m => m.id !== id);
        return prev.map(m => m.id !== id ? m : kind === 'delete'
          ? { ...m, is_deleted: true, content: '🚫 Pesan ini telah dihapus', media_url: undefined, reactions: [] }
          : kind === 'edit' ? { ...m, content: data.new_content || data.content, is_edited: true }
          : { ...m, reactions: normalizeReactions(data.reactions) });
      });
    };
    const subscriptions = [
      websocketClient.on('message_deleted', data => update('delete', data)),
      websocketClient.on('delete_message', data => update('delete', data)),
      websocketClient.on('message_edited', data => update('edit', data)),
      websocketClient.on('reaction', data => update('reaction', data)),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [roomId, token, setSourceWindow]);

  const setMessages = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      setRoomMessages(roomId, updater);
      setSourceWindow(prev => prev ? (typeof updater === 'function' ? updater(prev) : updater) : null);
    },
    [roomId, setRoomMessages, setSourceWindow]
  );

  // Synchronized callback refs to prevent room mount effect from looping/thrashing
  const getRoomMessagesRef = useRef(getRoomMessages);
  useEffect(() => {
    getRoomMessagesRef.current = getRoomMessages;
  }, [getRoomMessages]);

  const hydrateRoomFromLocalDBRef = useRef(hydrateRoomFromLocalDB);
  useEffect(() => {
    hydrateRoomFromLocalDBRef.current = hydrateRoomFromLocalDB;
  }, [hydrateRoomFromLocalDB]);

  const markRoomLoadingRef = useRef(markRoomLoading);
  useEffect(() => {
    markRoomLoadingRef.current = markRoomLoading;
  }, [markRoomLoading]);

  const [isSending, setIsSending] = useState(false);
  const [stagedMedia, setStagedMedia] = useState<StagedMedia | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isPreparingMedia, setIsPreparingMedia] = useState(false);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [roomAESKey, setRoomAESKey] = useState<Uint8Array | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [actionSheetMessage, setActionSheetMessage] = useState<Message | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState<number>(conversation.member_count || 0);
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  // Topik forum dikunci admin saat kita sedang di dalam ruang: server menolak kirim (ack/ERROR "kedaluwarsa") atau
  // penyegaran berkala melihat expires_at/status berubah. `expiryTick` memaksa hitung ulang saat waktu kedaluwarsa terlewat.
  const [forumLockedByServer, setForumLockedByServer] = useState(false);
  const [expiryTick, setExpiryTick] = useState(0);
  // Anggota untuk autocomplete @mention: dimuat malas (baru saat pengguna mengetik "@"), bukan saat membuka room
  const [fetchedMentionMembers, setFetchedMentionMembers] = useState<GroupMember[] | undefined>(undefined);

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
  const currentSearchIndexRef = useRef<number>(0);
  const searchResultsRef = useRef<Message[]>([]);
  const searchTimerRef = useRef<any>(null);
  const searchInputRef = useRef<TextInput>(null);

  // DEC-013: Authorization Shield State (403 Forbidden interceptor)
  const [isAccessDenied, setIsAccessDenied] = useState<boolean>(false);
  const [accessDeniedError, setAccessDeniedError] = useState<string | null>(null);

  // DEC-012: Direct Link Public Group Preview State
  const [directPreviewGroup, setDirectPreviewGroup] = useState<GroupDetails | null>(null);

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

  // DEC-020 / SWR: Check if this group is already an established/known conversation
  // (opened from chat list, has role, has last_message/history, or cached in SQLite/memory)
  const isKnownGroupMember = useMemo(() => {
    if (!isGroup) return true;
    return Boolean(
      conversation.my_role ||
      conversation.last_message !== undefined ||
      conversation.unread_count !== undefined ||
      conversation.updated_at ||
      (messages && messages.length > 0)
    );
  }, [
    isGroup,
    conversation.my_role,
    conversation.last_message,
    conversation.unread_count,
    conversation.updated_at,
    messages,
  ]);

  // Pre-flight check state for groups (only blocks UI if group is an unverified direct link)
  const [isVerifyingGroup, setIsVerifyingGroup] = useState<boolean>(
    isGroup && !isKnownGroupMember
  );

  // M-Mobile-8.2B: Sub-group / forum topic state
  const [parentGroupDetails, setParentGroupDetails] = useState<GroupDetails | null>(null);
  const [showForumModal, setShowForumModal] = useState(false);

  // Milestone M-Mobile-8.5: Contact Profile & Verified Identity modal

  // Milestone M-Mobile-8.30: Room Media & Document Gallery modal
  const [showMediaGallery, setShowMediaGallery] = useState(false);

  const [peerPublicKey, setPeerPublicKey] = useState<string | undefined>(conversation.peer_public_key);

  const flatListRef = useRef<FlatList>(null);
  const scrollRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRetryCount = useRef(0);
  useEffect(() => {
    scrollRetryCount.current = 0;
    return () => { if (scrollRetryRef.current) clearTimeout(scrollRetryRef.current); };
  }, [roomId, token, sourceMessageId, sourceAttempt]);
  // Inverted list: newest message at index 0 so the chat opens at the bottom with no scroll jump
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const lastHandledMsgIdRef = useRef<string | null>(null);
  const roomAESKeyRef = useRef<Uint8Array | null>(null);
  const isPrependingRef = useRef<boolean>(false);
  const isLoadingOlderRef = useRef<boolean>(false);
  const isNearBottomRef = useRef<boolean>(true);
  const hasInitialScrolledRef = useRef<boolean>(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);
  // Tombol panah-bawah disembunyikan saat picker emoji terbuka (kalau tidak, menimpa grid emoji)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState<boolean>(false);
  const [unreadWhileScrolled, setUnreadWhileScrolled] = useState<number>(0);

  const handleScrollToBottom = useCallback(() => {
    isNearBottomRef.current = true;
    setShowScrollBottomBtn(false);
    setUnreadWhileScrolled(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // Load older messages for reverse infinite scroll
  const handleLoadOlder = useCallback(async () => {
    if (isLoadingOlderRef.current || isLoadingOlderMessages(roomId) || !hasMoreOlderMessages(roomId)) {
      return;
    }
    isLoadingOlderRef.current = true;
    isPrependingRef.current = true;
    try {
      await loadOlderMessages(roomId);
    } finally {
      isLoadingOlderRef.current = false;
      setTimeout(() => {
        isPrependingRef.current = false;
      }, 400);
    }
  }, [hasMoreOlderMessages, isLoadingOlderMessages, loadOlderMessages, roomId]);

  // Handle scroll and track if user is near bottom
  const handleScroll = useCallback(
    (event: any) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const offsetY = contentOffset?.y ?? 0;

      // Track if user is near the bottom (<= 150px from bottom)
      // List is inverted: offset 0 is the newest message (visual bottom)
      const distanceFromBottom = offsetY;
      const distanceFromOldest = (contentSize?.height ?? 0) - (offsetY + (layoutMeasurement?.height ?? 0));
      const nearBottom = distanceFromBottom <= 150;
      isNearBottomRef.current = nearBottom;

      // Show scroll-to-bottom FAB when user scrolled up more than 300px
      const shouldShowBtn = distanceFromBottom > 300;
      setShowScrollBottomBtn(shouldShowBtn);
      if (nearBottom) {
        setUnreadWhileScrolled(0);
      }

      // Trigger older messages fetch when scrolling near top
      if (
        distanceFromOldest <= 40 &&
        hasMoreOlderMessages(roomId) &&
        !isLoadingOlderMessages(roomId) &&
        messages.length >= 20
      ) {
        handleLoadOlder();
      }
    },
    [handleLoadOlder, hasMoreOlderMessages, isLoadingOlderMessages, messages.length, roomId]
  );

  // Fail-Closed: a forum topic is locked if expired
  const isForumExpired = useMemo(() => {
    if (!isSubGroup) return false;
    if (forumLockedByServer) return true;
    const details = groupDetails as any;
    if (details?.status === 'expired') return true;
    if (details?.expires_at) {
      return new Date(details.expires_at).getTime() <= Date.now();
    }
    return false;
    // expiryTick sengaja jadi dependensi: waktu berjalan walau groupDetails tidak berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubGroup, groupDetails, forumLockedByServer, expiryTick]);

  // Reset kunci lokal saat berpindah ruang.
  useEffect(() => {
    setForumLockedByServer(false);
  }, [roomId]);

  // Topik aktif: segarkan expires_at/status tiap 30 dtk agar penguncian oleh admin (akhiri sekarang) terlihat tanpa
  // menunggu pengguna mencoba mengirim, dan kunci otomatis saat waktu kedaluwarsa terlewat.
  useEffect(() => {
    if (!isSubGroup || isForumExpired || isAccessDenied) return;
    let cancelled = false;
    const timer = setInterval(() => {
      setExpiryTick((t) => t + 1);
      groupsApi
        .getGroupDetails(roomId)
        .then((fresh) => {
          if (cancelled || !fresh) return;
          const f = fresh as any;
          setGroupDetails((prev) =>
            prev ? ({ ...prev, expires_at: f.expires_at ?? (prev as any).expires_at, status: f.status ?? (prev as any).status } as any) : prev
          );
        })
        .catch(() => {});
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isSubGroup, isForumExpired, isAccessDenied, roomId]);

  const title =
    groupDetails?.title || conversation.title || conversation.peer_nickname || 'Obrolan';
  const avatarUrl =
    groupDetails?.avatar_url || conversation.avatar_url || conversation.peer_avatar_url;

  // Milestone M-Mobile-8.5: Deterministic peer resolution for 1-on-1 direct chat
  const resolvedPeerId = useMemo(() => {
    if (conversation.peer_id) return conversation.peer_id;
    if (roomId.startsWith('dm_')) {
      return extractDMPeerId(roomId, currentUserId);
    }
    if (conversation.participants?.length) {
      const other = conversation.participants.find((p) => p.id !== currentUserId);
      return other?.id || '';
    }
    return '';
  }, [conversation.peer_id, conversation.participants, roomId, currentUserId]);

  // Load connection status with peer for 1-on-1 Direct Chat (Milestone M-Mobile-10)
  useEffect(() => {
    if (!isDirect || !resolvedPeerId) return;
    let isMounted = true;
    checkConnectionStatus(resolvedPeerId)
      .then((status) => {
        if (isMounted) setPeerConnStatus(status);
      })
      .catch((err) => {
        console.warn('[ChatScreen] Failed to fetch peer connection status:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [isDirect, resolvedPeerId, checkConnectionStatus]);

  const isCallRestricted = Boolean(
    isDirect &&
      peerConnStatus &&
      peerConnStatus.is_private_account &&
      peerConnStatus.status !== 'accepted'
  );

  const handleAddFriendFromChat = useCallback(async () => {
    const peerId = resolvedPeerId || conversation.peer_id || '';
    if (!peerId) return;
    setIsAddingFriend(true);
    try {
      const res = await sendFriendRequest(peerId);
      setPeerConnStatus({
        status: res.status === 'accepted' ? 'accepted' : 'pending',
        direction: res.status === 'accepted' ? '' : 'outgoing',
        connection_id: res.id,
        is_private_account: true,
        can_message: res.status === 'accepted',
        can_call: res.status === 'accepted',
      });
    } catch (err) {
      console.warn('[ChatScreen] Failed to send friend request:', err);
    } finally {
      setIsAddingFriend(false);
    }
  }, [resolvedPeerId, conversation.peer_id, sendFriendRequest]);

  // WebRTC 1-on-1 Voice Calling Handler (DEC-CALL-03: Real Contact User ID)
  const handleVoiceCall = useCallback(async () => {
    if (isGroup) return;
    const peerId = resolvedPeerId || conversation.peer_id || '';
    const peerNickname = title || conversation.name || conversation.peer_nickname || 'Pengguna';
    const peerAvatar = avatarUrl || conversation.avatar_url || conversation.peer_avatar_url;

    // Guard Akun Privat & Pertemanan
    if (isCallRestricted || (peerConnStatus && !peerConnStatus.can_call)) {
      setShowPrivateNoticeModal(true);
      return;
    }

    // Jika peerConnStatus belum termuat, lakukan pengecekan langsung sebelum menelpon
    if (!peerConnStatus && peerId) {
      try {
        const status = await checkConnectionStatus(peerId);
        setPeerConnStatus(status);
        if (status.is_private_account && status.status !== 'accepted') {
          setShowPrivateNoticeModal(true);
          return;
        }
      } catch {
        // Lanjutkan jika offline / gagal fetch
      }
    }

    await startCall(roomId, peerId, peerNickname, peerAvatar);
  }, [
    isGroup,
    resolvedPeerId,
    conversation,
    title,
    avatarUrl,
    isCallRestricted,
    peerConnStatus,
    checkConnectionStatus,
    startCall,
    roomId,
  ]);

  // Helper deterministik untuk mendapatkan nama pengirim pesan (human-readable, anti-raw UUID)
  const getMessageSenderName = useCallback(
    (msg?: Message | null) => {
      if (!msg) return '';
      const isSelf =
        msg.sender_id === currentUserId ||
        msg.from === currentUserId ||
        (Boolean(user?.username) && msg.from === user?.username);

      if (isSelf) return 'Anda';
      if (isDirect) return title;
      if (
        msg.nickname &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(msg.nickname)
      ) {
        return msg.nickname;
      }
      return 'Pengguna';
    },
    [currentUserId, user?.username, isDirect, title]
  );

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

  // onBack (fungsi inline dari navigator) dan isKnownGroupMember berubah tiap render; bila jadi dependensi effect
  // di bawah, request detail grup yang sedang jalan dibatalkan lalu diulang, hasilnya terbuang dan server
  // menerima request berulang. Dibaca lewat ref agar effect hanya jalan sekali per room.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const isKnownGroupMemberRef = useRef(isKnownGroupMember);
  isKnownGroupMemberRef.current = isKnownGroupMember;

  const handleRequestMentionMembers = useCallback(() => {
    if (!isGroup || fetchedMentionMembers) return;
    loadMentionMembers(roomId)
      .then((members) => {
        if (members) setFetchedMentionMembers(members);
      })
      .catch(() => {});
  }, [isGroup, roomId, fetchedMentionMembers]);

  // Load & verify group details if group room
  useEffect(() => {
    if (!isGroup) {
      setIsVerifyingGroup(false);
      return;
    }
    let mounted = true;
    if (!isKnownGroupMemberRef.current) {
      setIsVerifyingGroup(true);
    }

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
          // Subgrup privat via tautan: anggota grup induk pun tidak boleh masuk tanpa
          // keanggotaan subgrup (ajukan izin lewat daftar forum).
          if (!details.is_public && !isUserMember) {
            setIsAccessDenied(true);
            setAccessDeniedError('Akses ditolak: Anda bukan anggota grup ini');
            setIsVerifyingGroup(false);
            markRoomLoading(roomId, false);
            return;
          }
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

        if (sourceMessageId) {
          setSourceError([403, 404].includes(err?.status) ? SOURCE_UNAVAILABLE : 'Konteks pesan gagal dimuat. Periksa koneksi lalu coba lagi.');
        } else if (isForbidden) {
          setIsAccessDenied(true);
          setAccessDeniedError(err?.detail || err?.message || 'Akses ditolak: Anda bukan anggota grup ini');
        } else if (!isKnownGroupMemberRef.current) {
          showAlert('Gagal Memuat Grup', err?.detail || err?.message || 'Grup tidak dapat diakses.');
          onBackRef.current();
        } else {
          // Resilient SWR: if network failed on an already known group, keep viewing cached messages
          console.warn('[ChatScreen] Could not refresh group details in background, keeping local view');
        }
        setIsVerifyingGroup(false);
        markRoomLoading(roomId, false);
      });

    return () => {
      mounted = false;
    };
  }, [isGroup, roomId]);

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
        peerId = extractDMPeerId(roomId, currentUserId);
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
        const derived = await ensureRoomAESKey(currentUserId, e2eeKeyPair.privateKeyHex, peerPubKey, roomId);
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

  // Teks kutipan balasan tidak boleh berupa ciphertext (mis. masuk lewat notifikasi saat kunci belum siap)
  const safeQuotePreview = useCallback(
    (msg: Message): string => {
      const text = quotePreviewText(msg);
      if (!isEncryptedMessage(text)) return text;
      const key = roomAESKeyRef.current;
      if (key) {
        try {
          return decryptText(key, text);
        } catch {
          /* jatuh ke placeholder */
        }
      }
      return '🔒 Pesan terenkripsi';
    },
    []
  );

  // 0B. Retroactively decrypt loaded messages once AES key is established
  useEffect(() => {
    if (!roomAESKey) return;
    if (!messages.some((m) => isEncryptedMessage(m.content) || isEncryptedMessage(m.reply_to?.content))) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (isEncryptedMessage(m.content)) {
          try {
            const plain = decryptText(roomAESKey, m.content);
            return { ...m, content: plain, is_encrypted: true, decrypt_failed: false };
          } catch {
            return { ...m, content: '🔒 Pesan terenkripsi (kunci tidak cocok)', is_encrypted: true };
          }
        }
        if (m.reply_to && isEncryptedMessage(m.reply_to.content)) {
          let quoted = '🔒 Pesan terenkripsi';
          try {
            quoted = decryptText(roomAESKey, m.reply_to.content ?? '');
          } catch {
            /* biarkan placeholder */
          }
          return { ...m, reply_to: { ...m.reply_to, content: quoted } };
        }
        return m;
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomAESKey, messages]);

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
    hasInitialScrolledRef.current = false;
    isNearBottomRef.current = true;
    setShowScrollBottomBtn(false);
    setUnreadWhileScrolled(0);

    // DEC-013 / DEC-012: Suppress WebSocket join & false timeout if:
    // 1. Still verifying group pre-flight
    // 2. Access is denied (HTTP 403 Forbidden)
    // 3. Waiting for public group preview confirmation
    if (isVerifyingGroup || isAccessDenied || directPreviewGroup) {
      return;
    }

    // Only set loading to true if we don't have cached messages in memory or local SQLite! (0ms SWR render)
    const cached = getRoomMessagesRef.current(roomId);
    if (!cached || cached.length === 0) {
      hydrateRoomFromLocalDBRef.current(roomId).then((localMsgs) => {
        if (!localMsgs || localMsgs.length === 0) {
          markRoomLoadingRef.current(roomId, true);
        }
      });
    }

    // Timeout safety in case history event is empty or room is newly created
    const timeout = setTimeout(() => {
      markRoomLoadingRef.current(roomId, false);
    }, 4000);

    // Event 'history' ditangani SATU kali oleh listener terpusat di MessageContext (merekonsiliasi, menyimpan, dan
    // menurunkan penanda loading). Layar ini hanya menghentikan timeout pengaman saat riwayat room ini tiba.
    const unsubscribeHistory = websocketClient.on('history', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom && targetRoom !== roomId) return;
      clearTimeout(timeout);
    });

    // Join room via WebSocket & send read receipt.
    // If WS is not yet OPEN (e.g. right after QR transfer), joinRoom returns false;
    // the state-change listener below joins once the connection becomes 'connected'.
    const joined = websocketClient.joinRoom(roomId);
    if (joined) {
      websocketClient.sendReceipt(roomId, 'read');
    }

    // Server hanya menaruh koneksi di room setelah 'join', dan koneksi baru (hasil reconnect) belum ada di room mana pun;
    // 'history' juga hanya dikirim saat join, jadi pesan yang masuk selama koneksi putus baru muncul bila join diulang.
    // onStateChange memanggil listener SEKETIKA dengan status saat ini (panggilan pertama): di situ hanya join ulang bila
    // join awal gagal (WS belum OPEN). Setelahnya, SETIAP transisi ke 'connected' = koneksi baru -> join ulang sekali.
    let firstStateCall = true;
    const unsubscribeWsState = websocketClient.onStateChange((state) => {
      const isInitialCall = firstStateCall;
      firstStateCall = false;
      if (state !== 'connected') return;
      if (isInitialCall && joined) return;
      console.log('[ChatScreen] WS connected — (re)joining room:', roomId);
      websocketClient.joinRoom(roomId);
      websocketClient.sendReceipt(roomId, 'read');
    });

    return () => {
      clearTimeout(timeout);
      unsubscribeHistory();
      unsubscribeWsState();
      markRoomLoadingRef.current(roomId, false);
    };
  }, [
    roomId,
    isVerifyingGroup,
    isAccessDenied,
    directPreviewGroup,
  ]);


  // 2. Realtime WebSocket Listeners (Anti-Stale Reprocessing Guard)
  useEffect(() => {
    if (isAccessDenied) return;

    // A. Incoming Message Listener (Active Room: Send read receipt and scroll)
    const unsubscribeMessage = websocketClient.on('message', (incoming: any) => {
      const targetRoom = incoming.room || incoming.room_id;
      if (targetRoom !== roomId) return;

      const incomingId = incoming.id || incoming.request_id;
      if (incomingId && incomingId === lastHandledMsgIdRef.current) {
        return;
      }
      if (incomingId) {
        lastHandledMsgIdRef.current = incomingId;
      }

      if (incoming.sender_id !== currentUserId && incoming.from !== currentUserId) {
        websocketClient.sendReceipt(roomId, 'read');
        markConversationAsRead(roomId);
      }

      if (!sourceModeRef.current && isNearBottomRef.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 100);
      } else {
        setUnreadWhileScrolled((prev) => prev + 1);
      }
    });

    // A2. Server menolak kirim karena topik sudah dikunci (ack error / pesan sistem "ERROR: ... kedaluwarsa")
    const isExpiredRejection = (text: unknown) =>
      typeof text === 'string' && /kedaluwarsa/i.test(text) && /terkunci|dikunci|kedaluwarsa/i.test(text);
    const unsubscribeAck = websocketClient.on('ack', (ack: any) => {
      if (!isSubGroup) return;
      if (ack?.status === 'error' && isExpiredRejection(ack?.content) && (!ack.room || ack.room === roomId)) {
        setForumLockedByServer(true);
      }
    });
    const unsubscribeSystem = websocketClient.on('system', (msg: any) => {
      if (!isSubGroup) return;
      const content = msg?.content;
      if (typeof content === 'string' && content.startsWith('ERROR:') && isExpiredRejection(content)) {
        setForumLockedByServer(true);
      }
    });

    // B. Pinned Messages Banner Sync
    const unsubscribePinned = websocketClient.on('message_pinned', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom !== roomId) return;

      messagesApi
        .getPinnedMessages(roomId)
        .then((pins) => {
          if (pins) {
            setPinnedMessages(pins);
          }
        })
        .catch(() => {});
    });

    // C. Message Unpinned Listener
    const unsubscribeUnpinned = websocketClient.on('message_unpinned', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (targetRoom !== roomId) return;

      const targetId = data.id || data.message_id;
      if (targetId) {
        setPinnedMessages((prev) =>
          prev.filter((p: any) => (p.message_id || p.id) !== targetId)
        );
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeAck();
      unsubscribeSystem();
      unsubscribePinned();
      unsubscribeUnpinned();
    };
  }, [roomId, currentUserId, isAccessDenied, isSubGroup]);

  // 3. Image Picker Handlers
  const handlePickCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showAlert(
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
      showAlert('Gagal Mengakses Kamera', 'Terjadi kesalahan saat membuka kamera perangkat.');
    }
  };

  // Menyiapkan video (validasi durasi, kompres, thumbnail) lalu menaruhnya sebagai lampiran siap kirim.
  const stageVideoAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsPreparingMedia(true);
    setMediaProgress(0);
    try {
      const prepared = await prepareVideo(asset.uri, {
        fileName: asset.fileName,
        durationMs: asset.duration,
        onProgress: setMediaProgress,
      });
      setStagedMedia({
        uri: prepared.uri,
        fileName: prepared.fileName,
        fileSize: prepared.fileSize,
        mimeType: prepared.mimeType,
        width: prepared.width,
        height: prepared.height,
        mediaType: 'video',
        thumbUri: prepared.thumbUri,
        thumbSize: prepared.thumbSize,
        durationMs: prepared.durationMs,
      });
    } catch (err) {
      console.warn('[ChatScreen] Gagal menyiapkan video:', err);
      showAlert(
        'Video Tidak Bisa Dikirim',
        err instanceof VideoPrepError ? err.message : 'Terjadi kesalahan saat menyiapkan video. Coba video lain.'
      );
    } finally {
      setIsPreparingMedia(false);
      setMediaProgress(null);
    }
  };

  const handlePickVideo = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showAlert(
          'Izin Kamera Dibutuhkan',
          'Aplikasi membutuhkan izin kamera untuk merekam video secara langsung.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: VIDEO_MAX_DURATION_SEC,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        void stageVideoAsset(result.assets[0]);
      }
    } catch (err) {
      console.warn('[ChatScreen] Error launching video camera:', err);
      showAlert('Gagal Mengakses Kamera', 'Terjadi kesalahan saat membuka kamera perangkat.');
    }
  };

  const handlePickGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert(
          'Izin Galeri Dibutuhkan',
          'Aplikasi membutuhkan izin akses galeri untuk memilih foto dari perangkat Anda.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        base64: true, // hanya berlaku untuk gambar; video diabaikan oleh picker
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.type === 'video') {
          void stageVideoAsset(asset);
          return;
        }
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
      showAlert('Gagal Mengakses Galeri', 'Terjadi kesalahan saat membuka galeri foto.');
    }
  };

  const handleCancelStagedMedia = () => {
    setStagedMedia(null);
  };

  const handleMediaLoaded = useCallback(
    (msg: Message) => {
      acknowledgeCachedMedia(msg, currentUserId, mediaApi.acknowledgeMediaDownload).catch(() => {
        // Do not retry in a loop; a later opening can retry a failed ACK.
        console.warn('[ChatScreen] Media ACK failed');
      });
    },
    [currentUserId, roomId]
  );

  // 4. Handle Send Message (Optimistic UI + Media Upload + Transparent E2EE)
  const handleSendMessage = useCallback(
    async (text: string, media?: StagedMedia | null, mentions?: string[]) => {
      const trimmedText = text.trim();
      if (!trimmedText && !media) return;

      const msgId = Crypto.randomUUID();
      const nowIso = new Date().toISOString();

      let uploadedMediaUrl: string | undefined;
      let uploadedFileName: string | undefined;
      let uploadedFileSize: number | undefined;

      // A. Jika ada lampiran media, unggah ke backend storage terlebih dahulu
      if (media) {
        setIsUploadingMedia(true);
        setMediaProgress(0);
        try {
          const uploadRes =
            media.mediaType === 'video' && media.thumbUri && media.thumbSize && media.fileSize
              ? await mediaApi.uploadVideo({
                  uri: media.uri,
                  fileName: media.fileName || `video_${Date.now()}.mp4`,
                  fileSize: media.fileSize,
                  thumbUri: media.thumbUri,
                  thumbSize: media.thumbSize,
                  onProgress: setMediaProgress,
                })
              : await mediaApi.uploadMedia(media.uri, media.fileName, media.mimeType, media.base64);
          uploadedMediaUrl = uploadRes.url;
          uploadedFileName = uploadRes.file_name;
          uploadedFileSize = uploadRes.file_size;

          // DEC-034: Persist local copy of uploaded media to cache so sender never loses it
          mediaCache.saveLocalFileToCache(media.uri, msgId, uploadedMediaUrl, uploadedFileName).catch((cacheErr) => {
            console.warn('[ChatScreen] Failed to cache sent media:', cacheErr);
          });
        } catch (err: any) {
          console.error('[ChatScreen] Media upload failed:', err);
          showAlert(
            media.mediaType === 'video' ? 'Gagal Mengunggah Video' : 'Gagal Mengunggah Gambar',
            err.detail || err.message || 'Terjadi kesalahan saat mengunggah ke server. Coba lagi.'
          );
          setIsUploadingMedia(false);
          return;
        } finally {
          setIsUploadingMedia(false);
          setMediaProgress(null);
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
            nickname: getMessageSenderName(replyingTo),
            content: safeQuotePreview(replyingTo),
            media_url: replyingTo.media_url,
            media_type: replyingTo.media_type,
          }
        : undefined;

      // C. Render optimistic di timeline
      const optimisticMsg: Message = {
        id: msgId,
        room_id: roomId,
        sender_id: currentUserId,
        content: trimmedText,
        is_encrypted: isEncrypted,
        created_at: nowIso,
        timestamp: nowIso,
        status: 'sending',
        reply_to: replyPayload,
        mentions,
        media_url: media ? media.uri : undefined,
        media_type: media ? (media.mediaType ?? 'image') : undefined,
        local_thumb_uri: media?.mediaType === 'video' ? media.thumbUri : undefined,
        file_name: uploadedFileName || media?.fileName,
        file_size: uploadedFileSize || media?.fileSize,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setStagedMedia(null);
      setReplyingTo(null);
      isNearBottomRef.current = true;
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);

      // D. Kirim pesan WebSocket lengkap dengan metadata media dan reply_to jika ada
      const mediaOptions = uploadedMediaUrl
        ? {
            media_url: uploadedMediaUrl,
            media_type: media?.mediaType ?? 'image',
            file_name: uploadedFileName,
            file_size: uploadedFileSize,
          }
        : undefined;

      const sent = websocketClient.sendMessage(
        roomId,
        payloadToSend,
        msgId,
        mediaOptions,
        replyPayload,
        msgId,
        mentions
      );
      if (!sent) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'failed' } : m))
        );
      }
    },
    [roomId, currentUserId, isDirect, replyingTo, title, safeQuotePreview]
  );

  // 4b. Handle Send Audio Voice Note (WhatsApp Store-and-Forward + Optimistic UI)
  const handleSendAudio = useCallback(
    async (uri: string, durationSeconds: number, fileSize?: number) => {
      const msgId = Crypto.randomUUID();
      mediaCache.registerLocalSource(msgId, uri);
      const nowIso = new Date().toISOString();
      const fileName = `voice_note_${Date.now()}.m4a`;

      // Quoted Reply Context (if active)
      const replyPayload = replyingTo
        ? {
            id: replyingTo.id,
            nickname: getMessageSenderName(replyingTo),
            content: safeQuotePreview(replyingTo),
            media_url: replyingTo.media_url,
            media_type: replyingTo.media_type,
          }
        : undefined;

      // A. Render optimistic audio bubble in timeline immediately (0ms)
      const optimisticMsg: Message = {
        id: msgId,
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
      isNearBottomRef.current = true;
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);

      // B. Upload audio file to storage in background
      try {
        const uploadRes = await mediaApi.uploadMedia(uri, fileName, 'audio/m4a');

        // DEC-034: Persist local copy of sent voice note to cache
        mediaCache.saveLocalFileToCache(uri, msgId, uploadRes.url, uploadRes.file_name).catch((cacheErr) => {
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
          msgId,
          mediaOptions,
          replyPayload,
          msgId
        );

        if (sent) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
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
            prev.map((m) => (m.id === msgId ? { ...m, status: 'failed' } : m))
          );
        }
      } catch (err: any) {
        console.error('[ChatScreen] Audio upload failed:', err);
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'failed' } : m))
        );
        showAlert(
          'Gagal Mengunggah Pesan Suara',
          err.detail || err.message || 'Terjadi kesalahan saat mengunggah rekaman suara ke server.'
        );
      }
    },
    [roomId, currentUserId, replyingTo, title, safeQuotePreview]
  );

  // 5. Handle Reaction on Message
  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      websocketClient.sendReaction(roomId, messageId, emoji);
    },
    [roomId]
  );

  // 6. Handle Delete Message with Optimistic UI Update (Delete for me vs Delete for everyone)
  const handleDeleteMessage = useCallback(
    async (messageId: string, type: 'for_me' | 'for_everyone') => {
      // Snapshot current messages for rollback on network failure
      const previousMessages = messages;
      const previousLatestMessages = getRoomMessages(roomId);

      // Optimistic state mutation
      if (type === 'for_everyone') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, is_deleted: true, content: '🚫 Pesan ini telah dihapus' }
              : m
          )
        );
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }

      if (replyingTo?.id === messageId) {
        setReplyingTo(null);
      }
      if (editingMessage?.id === messageId) {
        setEditingMessage(null);
      }

      try {
        await messagesApi.deleteMessage(messageId, roomId, type);
        // REST for_me tidak menyiarkan event WebSocket. Konfirmasi juga ke cache
        // persisten; setMessages di atas hanya mengubah tampilan optimistik.
        if (type === 'for_me') {
          removeMessage(roomId, messageId);
        } else {
          updateMessage(roomId, messageId, {
            is_deleted: true,
            content: '🚫 Pesan ini telah dihapus',
          });
        }
      } catch (err: any) {
        console.warn('[ChatScreen] Delete message failed, rolling back:', err);
        // Rollback state on error
        setRoomMessages(roomId, previousLatestMessages);
        setSourceWindow(prev => prev ? previousMessages : null);
        showAlert('Gagal Menghapus', err.detail || err.message || 'Tidak dapat menghapus pesan.');
      }
    },
    [roomId, messages, replyingTo?.id, editingMessage?.id, removeMessage, updateMessage, setMessages]
  );

  // 7. Handle Press Quote (Scroll to target message with highlight pulse)
  // Ketuk @username: buka profil (bukan langsung chat) agar akun privat tetap lewat alur permintaan pertemanan
  const handlePressMention = useCallback(
    (mentionedUsername: string) => {
      if (!onOpenUserProfile) return;
      const uname = mentionedUsername.toLowerCase();
      const member = groupDetails?.members?.find((m) => m.username.toLowerCase() === uname);
      onOpenUserProfile(member?.user_id || '', member ? undefined : mentionedUsername);
    },
    [onOpenUserProfile, groupDetails?.members]
  );

  const handleRetryDecrypt = useCallback(
    async (msg: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, decrypt_failed: false } : m)));
      const key = roomAESKeyRef.current || (await getRoomAESKey(roomId));
      let plain: string | null = null;
      if (key) {
        try {
          plain = decryptText(key, msg.content);
        } catch {
          plain = '🔒 Pesan terenkripsi (kunci tidak cocok)';
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? plain !== null
              ? { ...m, content: plain, decrypt_failed: false }
              : { ...m, decrypt_failed: true }
            : m
        )
      );
    },
    [roomId, getRoomAESKey, setMessages]
  );

  // Ref agar handlePressQuote stabil (tidak berubah tiap pesan baru) dan MessageBubble memo tetap efektif
  const invertedMessagesRef = useRef(invertedMessages);
  invertedMessagesRef.current = invertedMessages;

  const handlePressQuote = useCallback(
    (targetMessageId: string) => {
      const index = invertedMessagesRef.current.findIndex((m) => m.id === targetMessageId);
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
        showAlert('Pesan Tidak Ditemukan', 'Pesan asli mungkin berada di riwayat sebelumnya.');
      }
    },
    []
  );

  useEffect(() => {
    if (!sourceWindow || !sourceMessageId || isVerifyingGroup || isAccessDenied) return;
    const timer = setTimeout(() => {
      const index = invertedMessagesRef.current.findIndex(m => m.id === sourceMessageId);
      if (index < 0) return;
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      setHighlightedMessageId(sourceMessageId);
    }, 100);
    const highlightTimer = setTimeout(() => setHighlightedMessageId(null), 2500);
    return () => { clearTimeout(timer); clearTimeout(highlightTimer); };
  }, [sourceWindow, sourceMessageId, isVerifyingGroup, isAccessDenied]);

  // Stable callbacks + renderItem for the message FlatList (keeps MessageBubble memoized)
  const handleTyping = useCallback(() => {
    websocketClient.sendTyping(roomId);
  }, [roomId]);
  const handleBubbleReply = useCallback((msg: Message) => setReplyingTo(msg), []);
  const handleBubbleLongPress = useCallback((msg: Message) => setActionSheetMessage(msg), []);
  const messageKeyExtractor = useCallback((item: Message) => item.id, []);
  const username = user?.username;

  const renderMessageItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      // Daftar terbalik: indeks berikutnya = pesan yang lebih lama. Pemisah tanggal muncul di atas
      // pesan pertama tiap hari; dihitung per item agar indeks data (scrollToIndex) tidak bergeser.
      const itemTs = item.timestamp || item.created_at;
      const olderMsg = invertedMessagesRef.current[index + 1];
      const itemDay = dayKey(itemTs);
      const showDateSeparator =
        itemDay !== null && itemDay !== dayKey(olderMsg ? olderMsg.timestamp || olderMsg.created_at : null);

      const isSelf =
        item.sender_id === currentUserId ||
        item.from === currentUserId ||
        (Boolean(username) && item.from === username);

      const bubble = isSystemMessage(item) ? (
        <SystemMessageRow text={item.content} />
      ) : (
        <MessageBubble
          message={item}
          isSelf={isSelf}
          showSenderName={!isDirect && !isSelf}
          senderName={item.nickname || item.from}
          currentUserId={currentUserId}
          isHighlighted={item.id === highlightedMessageId}
          onMediaLoaded={handleMediaLoaded}
          onReply={handleBubbleReply}
          onLongPress={handleBubbleLongPress}
          onPressQuote={handlePressQuote}
          onReact={handleReact}
          onPressPost={onOpenPost}
          onPressMention={handlePressMention}
          onRetryDecrypt={handleRetryDecrypt}
        />
      );

      if (!showDateSeparator) return bubble;
      return (
        <View>
          <DateSeparator timestamp={itemTs as string} />
          {bubble}
        </View>
      );
    },
    [
      currentUserId,
      username,
      isDirect,
      highlightedMessageId,
      handleMediaLoaded,
      handleBubbleReply,
      handleBubbleLongPress,
      handlePressQuote,
      handleReact,
      onOpenPost,
      handleRetryDecrypt,
      handlePressMention,
    ]
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
        showAlert(
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
      showAlert('Terkirim', `Pesan berhasil diteruskan ke ${targetRoomIds.length} obrolan.`);
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
        showAlert('Gagal', err?.detail || err?.message || 'Gagal mengubah status sematan pesan.');
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
        showAlert('Gagal', err?.detail || err?.message || 'Gagal melepas sematan pesan.');
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
    (messageId: string, notifyIfMissing = true) => {
      const index = invertedMessages.findIndex((m) => m.id === messageId);
      if (index !== -1 && flatListRef.current) {
        // Crucial: Disarm near-bottom auto-scroll so list doesn't snap back to bottom
        isNearBottomRef.current = false;

        setHighlightedMessageId(messageId);
        setTimeout(() => {
          setHighlightedMessageId((current) => (current === messageId ? null : current));
        }, 2500);

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
      } else if (notifyIfMissing) {
        showAlert('Pesan Tidak Ditemukan', 'Pesan mungkin berada di riwayat sebelumnya.');
      }
    },
    [invertedMessages]
  );

  // 11. Milestone 8.3: In-Chat Search Handlers
  const handleStartSearch = useCallback(() => {
    setIsSearching(true);
    setSearchQuery('');
    setSearchResults([]);
    searchResultsRef.current = [];
    currentSearchIndexRef.current = 0;
    setCurrentSearchIndex(0);
  }, []);

  const handleCloseSearch = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    searchResultsRef.current = [];
    currentSearchIndexRef.current = 0;
    setCurrentSearchIndex(0);
    setHighlightedMessageId(null);
  }, []);

  // Android hardware back button closes search mode before leaving the room
  useEffect(() => {
    if (!isSearching) return;
    const onHardwareBack = () => {
      handleCloseSearch();
      return true;
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => backSub.remove();
  }, [isSearching, handleCloseSearch]);

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      const q = query.trim().toLowerCase();
      if (!q) {
        searchResultsRef.current = [];
        currentSearchIndexRef.current = 0;
        setSearchResults([]);
        setCurrentSearchIndex(0);
        setHighlightedMessageId(null);
        return;
      }

      // Fast, synchronous client-side search over decrypted messages (WhatsApp & Web pattern)
      // Reverse order so index 0 is the newest match (most recent in timeline)
      const matches = messages
        .filter(
          (m) =>
            !m.is_deleted &&
            ((m.content && m.content.toLowerCase().includes(q)) ||
              (m.file_name && m.file_name.toLowerCase().includes(q)))
        )
        .reverse();

      searchResultsRef.current = matches;
      currentSearchIndexRef.current = 0;
      setSearchResults(matches);
      setCurrentSearchIndex(0);

      if (matches.length > 0) {
        setHighlightedMessageId(matches[0].id);
        // Debounce list scroll so active typing is never interrupted by viewport jumping
        searchTimerRef.current = setTimeout(() => {
          handleJumpToMessage(matches[0].id, false);
        }, 500);
      } else {
        setHighlightedMessageId(null);
      }
    },
    [messages, handleJumpToMessage]
  );

  // Re-sync search results if messages change while search is active (e.g. older messages loaded)
  useEffect(() => {
    if (isSearching && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matches = messages
        .filter(
          (m) =>
            !m.is_deleted &&
            ((m.content && m.content.toLowerCase().includes(q)) ||
              (m.file_name && m.file_name.toLowerCase().includes(q)))
        )
        .reverse();
      searchResultsRef.current = matches;
      setSearchResults(matches);
    }
  }, [isSearching, searchQuery, messages]);

  const handleSearchPrev = useCallback(() => {
    const total = searchResultsRef.current.length;
    if (total === 0) return;
    // Up arrow (▲): navigate to earlier/older matching message in history
    const nextIndex = total === 1 ? 0 : (currentSearchIndexRef.current + 1) % total;
    currentSearchIndexRef.current = nextIndex;
    setCurrentSearchIndex(nextIndex);
    const targetMsg = searchResultsRef.current[nextIndex];
    if (targetMsg) {
      handleJumpToMessage(targetMsg.id, false);
    }
  }, [handleJumpToMessage]);

  const handleSearchNext = useCallback(() => {
    const total = searchResultsRef.current.length;
    if (total === 0) return;
    // Down arrow (▼): navigate to later/newer matching message in history
    const nextIndex = total === 1 ? 0 : (currentSearchIndexRef.current - 1 + total) % total;
    currentSearchIndexRef.current = nextIndex;
    setCurrentSearchIndex(nextIndex);
    const targetMsg = searchResultsRef.current[nextIndex];
    if (targetMsg) {
      handleJumpToMessage(targetMsg.id, false);
    }
  }, [handleJumpToMessage]);

  const handleSearchSubmit = useCallback(() => {
    const total = searchResultsRef.current.length;
    if (total === 0) return;
    const targetMsg = searchResultsRef.current[currentSearchIndexRef.current];
    if (targetMsg) {
      handleJumpToMessage(targetMsg.id, false);
    }
  }, [handleJumpToMessage]);

  if (sourceMessageId && !sourceDismissed && sourceError) {
    return <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.centerContainer}>
        <Text style={styles.emptySubtitle}>{sourceError}</Text>
        {sourceError !== SOURCE_UNAVAILABLE ? <Button title="Coba Lagi" variant="secondary" onPress={() => setSourceAttempt(n => n + 1)} /> : null}
        <Button title="Kembali" variant="ghost" onPress={onBack} />
      </View>
    </View>;
  }

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
      {/* Sticky Header — OUTSIDE KeyboardAvoidingView agar tidak terdorong naik oleh keyboard */}
      {isSearching ? (
        <View style={styles.searchHeaderBar}>
          <TouchableOpacity
            style={styles.searchHeaderBackBtn}
            onPress={handleCloseSearch}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Icon name="back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.searchHeaderInputContainer}>
            <TextInput
              ref={searchInputRef}
              style={styles.searchHeaderInput}
              placeholder="Cari pesan dalam obrolan..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={handleSearchQueryChange}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={handleSearchSubmit}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  handleSearchQueryChange('');
                  searchInputRef.current?.focus();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.searchNavCol}>
            {searchQuery.trim().length > 0 ? (
              <Text
                style={[
                  styles.searchCounterText,
                  searchResults.length === 0 && styles.searchCounterEmpty,
                ]}
              >
                {searchResults.length > 0
                  ? `${currentSearchIndex + 1}/${searchResults.length}`
                  : '0/0'}
              </Text>
            ) : null}
            <View style={styles.searchNavButtons}>
              <TouchableOpacity
                style={[
                  styles.searchNavBtn,
                  searchResults.length === 0 && styles.searchNavBtnDisabled,
                ]}
                onPress={handleSearchPrev}
                disabled={searchResults.length === 0}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <IconText
                  style={[
                    styles.searchNavIcon,
                    searchResults.length === 0 && styles.searchNavIconDisabled,
                  ]}
                >
                  ▲
                </IconText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.searchNavBtn,
                  searchResults.length === 0 && styles.searchNavBtnDisabled,
                ]}
                onPress={handleSearchNext}
                disabled={searchResults.length === 0}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <IconText
                  style={[
                    styles.searchNavIcon,
                    searchResults.length === 0 && styles.searchNavIconDisabled,
                  ]}
                >
                  ▼
                </IconText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.header, isSubGroup && styles.headerTall]}>
          {/* Back button: sub-group → navigate to parent group first */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (isSubGroup && onNavigateToParent && !backToOrigin) {
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
            <Icon name="back" size={24} color={colors.textPrimary} />
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
              } else if (isDirect && resolvedPeerId && onOpenUserProfile) {
                onOpenUserProfile(resolvedPeerId);
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

                {/* "Sedang mengetik" menggantikan subjudul selama ada yang mengetik (state-nya di komponen anak) */}
                <ChatHeaderStatus roomId={roomId} isDirect={isDirect}>
                  {isSubGroup ? (
                    /* M-Mobile-8.2C: Interactive breadcrumb for sub-group rooms */
                    <IconText style={styles.headerBreadcrumb} numberOfLines={1}>
                      {'↖ '}
                      {parentGroupName ? `${parentGroupName} • ` : ''}
                      {'Forum'}
                      {memberCount > 0 ? ` • ${memberCount} anggota` : ''}
                    </IconText>
                  ) : (
                    <IconText style={styles.headerSubtitle} numberOfLines={1}>
                      {isDirect
                        ? (roomAESKey ? '🔒 Terenkripsi E2EE' : 'Online')
                        : `${memberCount > 0 ? `${memberCount} anggota` : 'Grup'}`}
                    </IconText>
                  )}
                </ChatHeaderStatus>
              </View>
            </View>
          </TouchableOpacity>

          {/* Right-side buttons */}
          <View style={styles.headerRightActions}>
            {/* Voice Call Button (1-on-1 Direct Chat Only) */}
            {isDirect && (
              <TouchableOpacity
                style={[
                  styles.headerIconButton,
                  isCallRestricted && styles.headerIconButtonRestricted,
                ]}
                onPress={handleVoiceCall}
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                activeOpacity={0.75}
              >
                <Icon name="call" size={20} color={colors.textPrimary} />
                {isCallRestricted && (
                  <View style={styles.headerCallLockBadge}>
                    <Icon name="lock" size={9} color={colors.textSecondary} />
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* In-Chat Search Button */}
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={handleStartSearch}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              activeOpacity={0.75}
            >
              <Icon name="search" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            {/* Milestone M-Mobile-8.30: Media Gallery Button. Grup induk memakainya lewat Info Grup
                ("Media & Berkas Grup"), jadi ikonnya dibuang dari header agar judul tidak terpotong. */}
            {!(isGroup && !isSubGroup && onOpenGroupInfo) && (
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => setShowMediaGallery(true)}
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                activeOpacity={0.75}
              >
                <Icon name="image" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            )}

            {isParentGroup && !onOpenGroupInfo && (
              // 🏛️ Forum button — only on parent groups, not sub-groups. Bila Info Grup tersedia, Forum
              // dibuka dari tombol "Forum" di sana (ikon dibuang agar judul grup tidak terpotong).
              <TouchableOpacity
                style={styles.forumButton}
                onPress={() => setShowForumModal(true)}
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                activeOpacity={0.75}
              >
                <IconText style={styles.forumButtonText}>🏛️</IconText>
              </TouchableOpacity>
            )}

            {isGroup && !isSubGroup && onOpenGroupInfo && (
              <TouchableOpacity
                style={styles.groupInfoButton}
                onPress={() => onOpenGroupInfo(groupDetails || conversation)}
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 12 }}
                activeOpacity={0.7}
              >
                <IconText style={styles.groupInfoIcon}>ℹ️</IconText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* KeyboardAvoidingView hanya menampung konten scrollable + input bar */}
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >

        {/* Milestone 8.3: Pinned Messages Banner */}
        <PinnedMessagesBanner
          pinnedMessages={enrichedPinnedMessages}
          onJumpToMessage={handleJumpToMessage}
          onUnpinMessage={handleUnpinMessage}
          canUnpin={true}
        />

        {/* Private Account Connection Banner in Direct Chat */}
        {isCallRestricted && (
          <View style={styles.privatePeerBanner}>
            <Icon name="lock" size={16} color={colors.textSecondary} />
            <Text style={styles.privatePeerBannerText} numberOfLines={2}>
              {peerConnStatus?.status === 'pending'
                ? 'Permintaan pertemanan sedang menunggu persetujuan.'
                : 'Akun ini privat. Tambah teman untuk mengaktifkan panggilan suara & video.'}
            </Text>
            {peerConnStatus?.status === 'none' && (
              <TouchableOpacity
                style={styles.privatePeerBannerBtn}
                onPress={handleAddFriendFromChat}
                disabled={isAddingFriend}
                activeOpacity={0.8}
              >
                {isAddingFriend ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.privatePeerBannerBtnText}>+ Teman</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* M-Mobile-8.2B: Fail-Closed Read-Only Banner for expired forum topics */}
        {isForumExpired && (
          <View style={styles.expiredBanner}>
            <IconText style={styles.expiredBannerText}>
              🔒 Forum telah berakhir. Riwayat diskusi tetap dapat dibaca.
            </IconText>
          </View>
        )}

        {/* Message Timeline */}
        {sourceMessageId && !sourceDismissed ? (
          <View style={styles.loadingOlderContainer}>
            <Text style={styles.loadingText}>{sourceError || (sourceLoading ? 'Memuat konteks pesan…' : 'Konteks pesan sumber')}</Text>
            {sourceError && sourceError !== SOURCE_UNAVAILABLE ? <Button title="Coba Lagi" variant="ghost" onPress={() => setSourceAttempt(n => n + 1)} /> : null}
            <Button title="Kembali ke Pesan Terbaru" variant="ghost" onPress={() => setSourceDismissed(true)} />
          </View>
        ) : null}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accentPrimary} />
            <Text style={styles.loadingText}>Memuat pesan...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.centerContainer}>
            <IconText style={styles.emptyIcon}>💬</IconText>
            <Text style={styles.emptyTitle}>Belum ada pesan</Text>
            <Text style={styles.emptySubtitle}>Kirim pesan pertama Anda untuk memulai percakapan.</Text>
          </View>
        ) : (
          <FlatList
            key={`${roomId}:${sourceWindow ? 'source' : 'latest'}`}
            ref={flatListRef}
            data={invertedMessages}
            inverted
            keyExtractor={messageKeyExtractor}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={(info) => {
              isNearBottomRef.current = false;
              // 1. Instantly jump near target offset to trigger FlatList to mount items
              flatListRef.current?.scrollToOffset({
                offset: Math.max(0, (info.averageItemLength || 75) * info.index),
                animated: false,
              });
              // 2. Retry scrollToIndex once layout is measured so target is cleanly centered
              if (scrollRetryCount.current++ >= 1) return;
              scrollRetryRef.current = setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 80);
            }}
            renderItem={renderMessageItem}
            initialNumToRender={sourceWindow ? sourceWindow.length : 15}
            maxToRenderPerBatch={10}
            windowSize={11}
            contentContainerStyle={styles.listContent}
            onScroll={sourceWindow ? undefined : handleScroll}
            scrollEventThrottle={32}
            ListFooterComponent={
              roomIsLoadingOlder ? (
                <View style={styles.loadingOlderContainer}>
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                  <Text style={styles.loadingOlderText}>Memuat riwayat pesan terdahulu...</Text>
                </View>
              ) : !sourceWindow && roomHasMoreOlder && messages.length >= 20 ? (
                <TouchableOpacity
                  style={styles.loadOlderButton}
                  onPress={handleLoadOlder}
                  activeOpacity={0.7}
                >
                  <IconText style={styles.loadOlderButtonText}>↑ Muat Pesan Terdahulu</IconText>
                </TouchableOpacity>
              ) : null
            }
            maintainVisibleContentPosition={sourceWindow ? undefined : {
              minIndexForVisible: 0,
              autoscrollToTopThreshold: 10,
            }}
          />
        )}

        {/* Floating Scroll to Bottom Button */}
        {showScrollBottomBtn && !emojiPickerOpen && (
          <TouchableOpacity
            style={styles.scrollToBottomFab}
            onPress={handleScrollToBottom}
            activeOpacity={0.8}
          >
            <IconText style={styles.scrollToBottomIcon}>↓</IconText>
            {unreadWhileScrolled > 0 && (
              <View style={styles.scrollToBottomBadge}>
                <Text style={styles.scrollToBottomBadgeText}>
                  {unreadWhileScrolled > 99 ? '99+' : unreadWhileScrolled}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Chat Input Bar — disabled when forum topic is expired (Fail-Closed Lock) */}
        <ChatInputBar
          onSend={handleSendMessage}
          onSendAudio={handleSendAudio}
          disabled={isSending || isUploadingMedia || isPreparingMedia || isForumExpired}
          stagedMedia={stagedMedia}
          isUploading={isUploadingMedia}
          isPreparingMedia={isPreparingMedia}
          mediaProgress={mediaProgress}
          onPickCamera={isForumExpired ? undefined : handlePickCamera}
          onPickVideo={isForumExpired ? undefined : handlePickVideo}
          onPickGallery={isForumExpired ? undefined : handlePickGallery}
          onCancelStagedMedia={handleCancelStagedMedia}
          replyTo={replyingTo ? { ...replyingTo, content: safeQuotePreview(replyingTo) } : null}
          onEmojiPickerChange={setEmojiPickerOpen}
          // Grup besar / jumlah anggota belum diketahui: tidak mengirim typing (lihat TYPING_MAX_GROUP_MEMBERS)
          onTyping={shouldSendTyping(isDirect, memberCount) ? handleTyping : undefined}
          replySenderName={getMessageSenderName(replyingTo)}
          onCancelReply={() => setReplyingTo(null)}
          editingMessage={editingMessage}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={() => setEditingMessage(null)}
          mentionMembers={
            isDirect
              ? undefined
              : groupDetails?.members && groupDetails.members.length > 0
                ? groupDetails.members
                : fetchedMentionMembers
          }
          onRequestMentionMembers={isDirect ? undefined : handleRequestMentionMembers}
          currentUserId={currentUserId}
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
        currentUserId={currentUserId}
        onClose={() => setActionSheetMessage(null)}
        onReact={handleReact}
        onReply={(msg) => setReplyingTo(msg)}
        onEdit={handleStartEdit}
        onForward={handleStartForward}
        onTogglePin={handleTogglePin}
        onReport={(msg) =>
          setReportTarget({
            type: 'message',
            id: msg.id,
            userId: msg.sender_id || undefined,
            evidence: msg.content || undefined,
            label: 'pesan',
          })
        }
        onDelete={handleDeleteMessage}
      />

      <ReportModal visible={Boolean(reportTarget)} target={reportTarget} onClose={() => setReportTarget(null)} />

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
          memoryEnabled={groupDetails?.memory_enabled === true}
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

      {/* Milestone M-Mobile-8.30: Conversation Media & Document Gallery */}
      <ChatMediaGalleryModal
        visible={showMediaGallery}
        roomId={roomId}
        userId={currentUserId}
        roomTitle={title}
        onClose={() => setShowMediaGallery(false)}
      />

      {/* Milestone M-Mobile-10: Private Account Notice Modal for Restricted Calls */}
      {isDirect && (
        <PrivateAccountNoticeModal
          visible={showPrivateNoticeModal}
          onClose={() => setShowPrivateNoticeModal(false)}
          targetUser={{
            id: resolvedPeerId || conversation.peer_id || '',
            display_name: title || conversation.name || 'Pengguna',
            avatar_url: avatarUrl || conversation.avatar_url,
          }}
          mode="call"
          title="Panggilan Dibatasi"
          description={`${title || 'Pengguna'} mengaktifkan akun privat. Panggilan suara dan video hanya dapat dilakukan oleh teman terhubung.`}
          connectionStatus={peerConnStatus?.status || 'none'}
          isAddingFriend={isAddingFriend}
          onAddFriend={handleAddFriendFromChat}
        />
      )}
    </View>
  );
};

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
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
    minWidth: 26,
    textAlign: 'center',
  },
  searchCounterEmpty: {
    color: colors.textMuted,
  },
  searchNavButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchNavBtnDisabled: {
    opacity: 0.35,
  },
  searchNavIcon: {
    fontSize: 11,
    color: colors.textPrimary,
  },
  searchNavIconDisabled: {
    color: colors.textMuted,
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
  // Load older messages reverse infinite scroll styles
  loadingOlderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
  },
  loadingOlderText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  loadOlderButton: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 14,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginVertical: spacing.sm,
  },
  loadOlderButtonText: {
    fontSize: 12,
    color: colors.accentPrimary,
    fontWeight: '600',
  },
  listContent: {
    paddingVertical: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-start',
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
  scrollToBottomFab: {
    position: 'absolute',
    right: 16,
    bottom: 74,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 30,
  },
  scrollToBottomIcon: {
    fontSize: 20,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: -2,
  },
  scrollToBottomBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: colors.accentFill,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.bgBase,
  },
  scrollToBottomBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerIconButtonRestricted: {
    opacity: 0.9,
  },
  headerCallLockBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.full,
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  privatePeerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintAccent10,
    borderBottomWidth: 1,
    borderBottomColor: colors.tintAccent20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  privatePeerBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  privatePeerBannerBtn: {
    backgroundColor: colors.accentFill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 28,
  },
  privatePeerBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
