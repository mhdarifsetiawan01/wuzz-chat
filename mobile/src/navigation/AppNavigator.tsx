/**
 * WuzzChat Mobile UI - AppNavigator
 * Native Stack Navigator using @react-navigation/native-stack.
 * Provides 60fps native animations (slide_from_right) & gesture swipe-to-back.
 * Modular, scalable, and easy to add or remove screens in the future.
 */

import React from 'react';
import { createNativeStackNavigator, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { Conversation, ConversationItem } from '../api/types';
import {
  ChatScreen,
  GroupInfoScreen,
  NewChatScreen,
  NewGroupScreen,
  RecentChatsScreen,
} from '../screens';
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
      initialRouteName="Home"
      screenOptions={defaultScreenOptions}
    >
      {/* 1. Home / Recent Conversations List */}
      <Stack.Screen name="Home">
        {({ navigation }) => (
          <RecentChatsScreen
            onSelectChat={(chat) =>
              navigation.navigate('Chat', {
                conversation: chat as ConversationItem,
              })
            }
            onStartNewChat={() => navigation.navigate('NewChat')}
            onStartNewGroup={() => navigation.navigate('NewGroup')}
          />
        )}
      </Stack.Screen>

      {/* 2. Active Chat Room (Direct, Group, or Sub-group) */}
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

      {/* 3. New Chat / Contact Discovery Screen */}
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
            onLeaveSuccess={() => navigation.navigate('Home')}
          />
        )}
      </Stack.Screen>

      {/* Future modular screens can simply be appended here */}
    </Stack.Navigator>
  );
};
