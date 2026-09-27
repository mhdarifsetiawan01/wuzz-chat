/**
 * WuzzChat Mobile UI — MainTabNavigator
 * Aurora Glassmorphic Bottom Tab Navigation (M-Mobile-8.19)
 *
 * Architecture:
 *  - 3 tabs: Chats | Calls | Settings
 *  - Custom Aurora tab bar: glassmorphic surface, safe-area insets, unread badge
 *  - Chats tab integrates with ConversationContext for live unread badge count
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabParamList, RootStackParamList } from './types';
import { RecentChatsScreen } from '../screens/RecentChatsScreen';
import { CallsHistoryScreen } from '../screens/CallsHistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors, spacing } from '../theme';
import { useConversations } from '../context/ConversationContext';
import { ConversationItem } from '../api/types';

const Tab = createBottomTabNavigator<TabParamList>();

// ─────────────────────────────────────────────────────────────────────────────
// Composite navigation type: Tab screen that can also push Root Stack screens
// ─────────────────────────────────────────────────────────────────────────────
type ChatsTabNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Chats'>,
  NativeStackNavigationProp<RootStackParamList>
>;

// ─────────────────────────────────────────────────────────────────────────────
// Tab Item Configuration
// ─────────────────────────────────────────────────────────────────────────────
interface TabConfig {
  key: keyof TabParamList;
  label: string;
  icon: string;
  iconActive: string;
}

const TAB_CONFIGS: TabConfig[] = [
  { key: 'Chats',    label: 'Obrolan',    icon: '💬', iconActive: '💬' },
  { key: 'Calls',    label: 'Panggilan',  icon: '📞', iconActive: '📞' },
  { key: 'Settings', label: 'Pengaturan', icon: '⚙️',  iconActive: '⚙️'  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Custom Aurora Glassmorphic Tab Bar
// ─────────────────────────────────────────────────────────────────────────────
function AuroraTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { conversations } = useConversations();

  // Compute total unread count for the Chats badge
  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.unread_count ?? 0),
    0
  );

  return (
    <View
      style={[
        styles.tabBar,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
      ]}
    >
      {state.routes.map((route, index) => {
        const tabCfg = TAB_CONFIGS.find((t) => t.key === route.name);
        if (!tabCfg) return null;

        const isFocused = state.index === index;
        const { options } = descriptors[route.key];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            // navigate to the tab — route.name is already typed via TabParamList
            navigation.navigate(route.name as keyof TabParamList);
          }
        };

        const showBadge = route.name === 'Chats' && totalUnread > 0;

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? tabCfg.label}
            onPress={onPress}
            style={styles.tabItem}
            activeOpacity={0.7}
          >
            {/* Icon container */}
            <View style={styles.iconWrapper}>
              <View
                style={[
                  styles.iconBg,
                  isFocused && styles.iconBgActive,
                ]}
              >
                <Text style={styles.tabIcon}>
                  {isFocused ? tabCfg.iconActive : tabCfg.icon}
                </Text>
              </View>

              {/* Unread badge */}
              {showBadge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {totalUnread > 99 ? '99+' : String(totalUnread)}
                  </Text>
                </View>
              )}
            </View>

            {/* Label */}
            <Text
              style={[
                styles.tabLabel,
                isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
              numberOfLines={1}
            >
              {tabCfg.label}
            </Text>

            {/* Active indicator dot */}
            {isFocused && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chats Screen Wrapper — passes Root Stack navigation callbacks down
// ─────────────────────────────────────────────────────────────────────────────
function ChatsTabScreen() {
  const navigation = useNavigation<ChatsTabNavigationProp>();

  return (
    <RecentChatsScreen
      onSelectChat={(chat) =>
        navigation.navigate('Chat', { conversation: chat as ConversationItem })
      }
      onStartNewChat={() => navigation.navigate('NewChat')}
      onStartNewGroup={() => navigation.navigate('NewGroup')}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Tab Navigator
// ─────────────────────────────────────────────────────────────────────────────
export const MainTabNavigator: React.FC = () => {
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => <AuroraTabBar {...props} />,
    []
  );

  return (
    <Tab.Navigator
      initialRouteName="Chats"
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Chats"    component={ChatsTabScreen} />
      <Tab.Screen name="Calls"    component={CallsHistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    ...Platform.select({
      android: { elevation: 16 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
    }),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    position: 'relative',
  },
  iconWrapper: {
    position: 'relative',
    marginBottom: 2,
  },
  iconBg: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconBgActive: {
    backgroundColor: colors.tintAccent20,
  },
  tabIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 1,
  },
  tabLabelActive: {
    color: colors.accentPrimary,
  },
  tabLabelInactive: {
    color: colors.textMuted,
  },
  activeDot: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentPrimary,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.unreadBadgeBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.bgBase,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 14,
  },
});
