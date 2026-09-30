/**
 * WuzzChat Mobile UI - AppNavigator (Root Native Stack)
 * Native Stack Navigator using @react-navigation/native-stack.
 * Provides 60fps native animations (slide_from_right) & gesture swipe-to-back.
 *
 * Architecture (M-Mobile-8.19):
 *  Root Stack entry = MainTabs (Bottom Tab Navigator).
 *  Full-screen screens (Chat, NewChat, NewGroup, GroupInfo) sit in Root Stack,
 *  so they slide OVER the tab bar naturally — no tabBarStyle toggling needed.
 */

import React from 'react';
import { createNativeStackNavigator, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { ConversationItem } from '../api/types';
import {
  ChatScreen,
  GroupInfoScreen,
  NewChatScreen,
  NewGroupScreen,
  UserProfileScreen,
  FriendsListScreen,
} from '../screens';
import { MainTabNavigator } from './MainTabNavigator';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const defaultScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'slide_from_right',
  gestureEnabled: true,
  contentStyle: {
    backgroundColor: colors.bgBase,
  },
};

export const AppNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={defaultScreenOptions}
    >
      {/* 1. Main Tabs — Bottom Tab Navigator (Chats | Calls | Settings) */}
      <Stack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ animation: 'none' }}
      />

      {/* 2. Active Chat Room — slides over tab bar (tab bar hidden naturally) */}
      <Stack.Screen
        name="Chat"
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      >
        {({ route, navigation }) => (
          <ChatScreen
            conversation={route.params.conversation}
            parentGroupConversation={route.params.parentGroupConversation}
            onBack={() => navigation.goBack()}
            onOpenUserProfile={(peerUserId) => {
              navigation.navigate('UserProfile', { userId: peerUserId });
            }}
            onOpenGroupInfo={(grp) => {
              const targetGroupId = grp.id || (grp as any).room_id || '';
              if (targetGroupId) {
                navigation.navigate('GroupInfo', { groupId: targetGroupId });
              }
            }}
            onNavigateToParent={(parentGroupId) => {
              if (
                route.params.parentGroupConversation &&
                route.params.parentGroupConversation.id === parentGroupId
              ) {
                navigation.navigate('Chat', {
                  conversation: route.params.parentGroupConversation,
                });
              } else {
                const parentConv: ConversationItem = {
                  id: parentGroupId,
                  room_id: parentGroupId,
                  type: 'group',
                  is_group: true,
                } as ConversationItem;
                navigation.navigate('Chat', { conversation: parentConv });
              }
            }}
            onEnterSubGroup={(subConv) => {
              navigation.push('Chat', {
                conversation: subConv as ConversationItem,
                parentGroupConversation: route.params.conversation,
              });
            }}
          />
        )}
      </Stack.Screen>

      {/* 3. New Chat / Contact Discovery */}
      <Stack.Screen
        name="NewChat"
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      >
        {({ navigation }) => (
          <NewChatScreen
            onBack={() => navigation.goBack()}
            onSelectChat={(chat) =>
              navigation.replace('Chat', {
                conversation: chat as ConversationItem,
              })
            }
            onNavigateToNewGroup={() => navigation.replace('NewGroup')}
            onNavigateToFriends={() => navigation.navigate('FriendsList')}
          />
        )}
      </Stack.Screen>

      {/* 4. New Group Creation Wizard */}
      <Stack.Screen
        name="NewGroup"
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      >
        {({ navigation }) => (
          <NewGroupScreen
            onBack={() => navigation.goBack()}
            onSelectChat={(chat) =>
              navigation.replace('Chat', {
                conversation: chat as ConversationItem,
              })
            }
          />
        )}
      </Stack.Screen>

      {/* 5. Group Info & Management */}
      <Stack.Screen
        name="GroupInfo"
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      >
        {({ route, navigation }) => (
          <GroupInfoScreen
            groupId={route.params.groupId}
            onBack={() => navigation.goBack()}
            onLeaveSuccess={() => navigation.navigate('MainTabs')}
            onOpenUserProfile={(memberUserId) => {
              navigation.navigate('UserProfile', { userId: memberUserId });
            }}
          />
        )}
      </Stack.Screen>

      {/* 6. User Profile Screen (Public / Identity) */}
      <Stack.Screen
        name="UserProfile"
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      >
        {({ route, navigation }) => (
          <UserProfileScreen
            userId={route.params.userId}
            username={route.params.username}
            initialUser={route.params.initialUser}
            onBack={() => navigation.goBack()}
            onStartChat={(conv) => {
              navigation.navigate('Chat', { conversation: conv });
            }}
          />
        )}
      </Stack.Screen>

      {/* 7. Friends List Screen (Milestone M-Mobile-10) */}
      <Stack.Screen
        name="FriendsList"
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      >
        {({ route, navigation }) => (
          <FriendsListScreen
            initialTab={route.params?.initialTab}
            onBack={() => navigation.goBack()}
            onOpenUserProfile={(peerUserId) => {
              navigation.navigate('UserProfile', { userId: peerUserId });
            }}
            onStartChat={(conv) => {
              navigation.navigate('Chat', { conversation: conv });
            }}
            onNavigateToNewChat={() => {
              navigation.navigate('NewChat');
            }}
          />
        )}
      </Stack.Screen>

      {/* Future modular screens can simply be appended here */}
    </Stack.Navigator>
  );
};
