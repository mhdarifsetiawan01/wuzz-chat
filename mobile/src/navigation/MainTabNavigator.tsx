/**
 * WuzzChat Mobile UI — MainTabNavigator
 * Aurora Floating Pill Bottom Tab Navigation
 *
 * Architecture:
 *  - 4 tabs: Chats | Feed | Calls | Settings
 *  - Floating pill bar with sliding capsule indicator, safe-area insets, unread badge
 *  - Chats tab integrates with ConversationContext for live unread badge count
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
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
import { FeedScreen } from '../screens/FeedScreen';
import { colors, spacing, radius } from '../theme';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/icons/registry';
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
  icon: IconName;
}

const TAB_CONFIGS: TabConfig[] = [
  { key: 'Chats',    label: 'Obrolan',    icon: 'chat' },
  { key: 'Feed',     label: 'Feed',       icon: 'feed' },
  { key: 'Calls',    label: 'Panggilan',  icon: 'call' },
  { key: 'Settings', label: 'Pengaturan', icon: 'settings' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tab Item — animated icon pop, tanpa kotak/ripple saat ditekan
// ─────────────────────────────────────────────────────────────────────────────
interface TabItemProps {
  cfg: TabConfig;
  isFocused: boolean;
  badge: number;
  accessibilityLabel: string;
  onPress: () => void;
}

const TabItem: React.FC<TabItemProps> = ({
  cfg,
  isFocused,
  badge,
  accessibilityLabel,
  onPress,
}) => {
  const focus = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(focus, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 120,
    }).start();
  }, [isFocused, focus]);

  const animatePress = (to: number) =>
    Animated.spring(press, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 200,
    }).start();

  const iconScale = Animated.multiply(
    press,
    focus.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] })
  );
  const iconLift = focus.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  const iconOpacity = focus.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => animatePress(0.88)}
      onPressOut={() => animatePress(1)}
      android_ripple={null}
      style={styles.tabItem}
    >
      <View style={styles.iconWrapper}>
        <Animated.View
          style={{ opacity: iconOpacity, transform: [{ translateY: iconLift }, { scale: iconScale }] }}
        >
          <Icon
            name={cfg.icon}
            size={ICON_SIZE}
            active={isFocused}
            color={isFocused ? colors.accentHover : colors.textMuted}
          />
        </Animated.View>
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
          </View>
        )}
      </View>
      <Text
        style={[styles.tabLabel, isFocused ? styles.tabLabelActive : styles.tabLabelInactive]}
        numberOfLines={1}
      >
        {cfg.label}
      </Text>
    </Pressable>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Custom Aurora Floating Pill Tab Bar
//  - Kapsul melayang dengan sudut membulat penuh
//  - Indikator kapsul meluncur halus (spring) mengikuti tab aktif
// ─────────────────────────────────────────────────────────────────────────────
function AuroraTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { conversations } = useConversations();
  const [barWidth, setBarWidth] = useState(0);
  const slide = useRef(new Animated.Value(state.index)).current;

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  const innerWidth = Math.max(barWidth - BAR_PADDING * 2, 0);
  const itemWidth = state.routes.length > 0 ? innerWidth / state.routes.length : 0;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: state.index,
      useNativeDriver: true,
      friction: 9,
      tension: 90,
    }).start();
  }, [state.index, slide]);

  const translateX = slide.interpolate({
    inputRange: state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => i * itemWidth),
  });

  return (
    <View
      style={[
        styles.tabBarOuter,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
      ]}
    >
      <View
        style={styles.tabBar}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {itemWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { width: itemWidth, transform: [{ translateX }] },
            ]}
          />
        )}
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
              navigation.navigate(route.name as keyof TabParamList);
            }
          };

          return (
            <TabItem
              key={route.key}
              cfg={tabCfg}
              isFocused={isFocused}
              badge={route.name === 'Chats' ? totalUnread : 0}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? tabCfg.label}
              onPress={onPress}
            />
          );
        })}
      </View>
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
      <Tab.Screen name="Feed"     component={FeedScreen} />
      <Tab.Screen name="Calls"    component={CallsHistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const BAR_PADDING = spacing.xs;
const ICON_SIZE = 24;

const styles = StyleSheet.create({
  tabBarOuter: {
    backgroundColor: colors.bgBase,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: BAR_PADDING,
    ...Platform.select({
      android: { elevation: 10 },
      ios: {
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
    }),
  },
  indicator: {
    position: 'absolute',
    top: BAR_PADDING,
    bottom: BAR_PADDING,
    left: BAR_PADDING,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent20,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: spacing.xs,
  },
  iconWrapper: {
    position: 'relative',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
    textAlign: 'center',
    // Lebar penuh item: Android kadang mengukur teks bobot 500 sedikit lebih sempit
    // dari yang dirender (label "Feed" jadi "Fe…" di layar 411dp).
    alignSelf: 'stretch',
  },
  tabLabelActive: {
    color: colors.accentHover,
    fontWeight: '700',
  },
  tabLabelInactive: {
    color: colors.textMuted,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.unreadBadgeBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.bgElevated,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.unreadBadgeText,
    lineHeight: 14,
  },
});
