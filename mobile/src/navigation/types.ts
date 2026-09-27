/**
 * WuzzChat Mobile Navigation - Type Definitions
 * Scalable & dynamic RootStackParamList for native stack navigation.
 * Easy to extend with new routes in the future.
 */

import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Conversation, ConversationItem } from '../api/types';

export type RootStackParamList = {
  Home: undefined;
  Chat: {
    conversation: ConversationItem;
    parentGroupConversation?: ConversationItem | null;
  };
  NewChat: undefined;
  NewGroup: undefined;
  GroupInfo: {
    groupId: string;
  };
  // Future screens can be added here easily:
  // Settings: undefined;
  // UserProfile: { userId: string };
  // MediaGallery: { roomId: string };
};

export type RootStackNavigationProp<T extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, T>;

export type RootStackRouteProp<T extends keyof RootStackParamList> =
  RouteProp<RootStackParamList, T>;

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
