/**
 * WuzzChat Mobile Navigation - Type Definitions
 * Scalable & dynamic RootStackParamList for native stack navigation.
 * Easy to extend with new routes in the future.
 *
 * Architecture (M-Mobile-8.19):
 *  RootStack → MainTabs (Bottom Tab entry) → individual tab screens
 *           → Chat, NewChat, NewGroup, GroupInfo (full-screen stack screens)
 */

import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabNavigationProp, BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { ConversationItem } from '../api/types';

// ─────────────────────────────────────────────────────────────────────────────
// Bottom Tab Param List (the 3 main tabs)
// ─────────────────────────────────────────────────────────────────────────────
export type TabParamList = {
  Chats: undefined;
  Feed: undefined;
  Calls: undefined;
  Settings: undefined;
};

export type TabNavigationProp<T extends keyof TabParamList> =
  BottomTabNavigationProp<TabParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> =
  BottomTabScreenProps<TabParamList, T>;

// ─────────────────────────────────────────────────────────────────────────────
// Root Stack Param List (wraps tabs + full-screen stacks)
// ─────────────────────────────────────────────────────────────────────────────
export type RootStackParamList = {
  /** Entry point: the bottom tab container */
  MainTabs: undefined;
  /** Full-screen chat room — rendered over the tab bar */
  Chat: {
    conversation: ConversationItem;
    parentGroupConversation?: ConversationItem | null;
  };
  /** Contact discovery */
  NewChat: undefined;
  /** Group creation wizard */
  NewGroup: undefined;
  /** Group info & management */
  GroupInfo: {
    groupId: string;
  };
  /** Public user profile screen */
  UserProfile: {
    userId?: string;
    username?: string;
    initialUser?: import('../api/types').User;
  };
  /** Mode baca layar penuh untuk postingan feed */
  PostReader: {
    postId: string;
    initialPost?: import('../api/types').FeedPost;
  };
  /** Friends list & pending connection requests */
  FriendsList?: {
    initialTab?: 'friends' | 'requests';
  };
};

export type RootStackNavigationProp<T extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, T>;

export type RootStackRouteProp<T extends keyof RootStackParamList> =
  RouteProp<RootStackParamList, T>;

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
