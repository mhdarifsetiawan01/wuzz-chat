/**
 * WuzzChat Mobile UI — FeedScreen
 * Clean Modern Social Feed & Status Timeline (Community news, status, and posts).
 */

import React, { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { colors, spacing } from '../theme';

interface FeedPost {
  id: string;
  authorName: string;
  authorAvatar?: string;
  authorRole?: string;
  timeAgo: string;
  content: string;
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
}

const SAMPLE_POSTS: FeedPost[] = [
  {
    id: 'post_1',
    authorName: 'Laura Ashley',
    timeAgo: '2h ago',
    authorRole: 'Product Design',
    content: 'Loving the new clean aesthetic on Wuzz! So much faster and easier to read through messages and discussions. What do you all think? 🚀✨',
    likesCount: 24,
    commentsCount: 5,
  },
  {
    id: 'post_2',
    authorName: 'Kenneth Cole',
    timeAgo: '4h ago',
    authorRole: 'Core Team',
    content: 'E2EE protocol update v2.4 has been successfully deployed. Zero-knowledge end-to-end encryption is now active across all personal and subgroup chats.',
    likesCount: 58,
    commentsCount: 12,
  },
  {
    id: 'post_3',
    authorName: 'Tina Turner',
    timeAgo: '7h ago',
    authorRole: 'Community',
    content: 'Great weekend vibes! Don’t forget to check out the new audio player bubbles with real-time scrubber support in chat.',
    likesCount: 19,
    commentsCount: 3,
  },
];

export const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<FeedPost[]>(SAMPLE_POSTS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const handleToggleLike = (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const isLiked = !p.isLiked;
          return {
            ...p,
            isLiked,
            likesCount: isLiked ? p.likesCount + 1 : Math.max(0, p.likesCount - 1),
          };
        }
        return p;
      })
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Feed Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <TouchableOpacity style={styles.newPostButton} activeOpacity={0.75}>
          <Text style={styles.newPostIcon}>✏️</Text>
          <Text style={styles.newPostText}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Feed Timeline List */}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentPrimary}
            colors={[colors.accentPrimary]}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom + 88, 100) },
        ]}
        renderItem={({ item }) => (
          <View style={styles.postCard}>
            {/* Post Author Header */}
            <View style={styles.postAuthorRow}>
              <Avatar name={item.authorName} avatarUrl={item.authorAvatar} size={46} shape="circle" />
              <View style={styles.postAuthorInfo}>
                <View style={styles.authorNameRow}>
                  <Text style={styles.authorName}>{item.authorName}</Text>
                  {item.authorRole && (
                    <View style={styles.roleTag}>
                      <Text style={styles.roleTagText}>{item.authorRole}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.postTimeAgo}>{item.timeAgo}</Text>
              </View>
            </View>

            {/* Post Content */}
            <Text style={styles.postContent}>{item.content}</Text>

            {/* Post Actions */}
            <View style={styles.postActionsRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleToggleLike(item.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.actionIcon}>{item.isLiked ? '❤️' : '🤍'}</Text>
                <Text style={[styles.actionCount, item.isLiked && styles.actionCountLiked]}>
                  {item.likesCount}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionCount}>{item.commentsCount}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
                <Text style={styles.actionIcon}>↗️</Text>
                <Text style={styles.actionCount}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#f4f7fb',
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  newPostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    gap: 6,
    elevation: 2,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  newPostIcon: {
    fontSize: 13,
    color: '#ffffff',
  },
  newPostText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  postCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  postAuthorInfo: {
    marginLeft: 12,
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  roleTag: {
    backgroundColor: colors.tintAccent10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  postTimeAgo: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  postContent: {
    fontSize: 14,
    lineHeight: 21,
    color: '#334155',
    marginBottom: 14,
  },
  postActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    gap: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    fontSize: 15,
  },
  actionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  actionCountLiked: {
    color: '#ef4444',
  },
});
