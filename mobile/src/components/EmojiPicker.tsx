/**
 * WuzzChat EmojiPicker Component
 * WhatsApp-Style Docked Bottom Tray (Replaces soft keyboard at ~280dp).
 * Features categorized Unicode emoji tabs and backspace key.
 * Conforms to frontend/DESIGN.md & WhatsApp Aurora theme.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { EMOJI_CATEGORIES, EmojiCategory } from '../constants/emojis';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onBackspace: () => void;
  height?: number;
}

const CATEGORIES = Object.values(EMOJI_CATEGORIES);
const NUM_COLUMNS = 7;
const SCREEN_WIDTH = Dimensions.get('window').width;
const EMOJI_SIZE = Math.floor((SCREEN_WIDTH - spacing.md * 2) / NUM_COLUMNS);

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelectEmoji,
  onBackspace,
  height = 280,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0].id);

  const currentCategory =
    CATEGORIES.find((cat) => cat.id === activeCategory) || CATEGORIES[0];

  const renderEmojiItem = ({ item }: { item: string }) => {
    return (
      <TouchableOpacity
        style={[styles.emojiItem, { width: EMOJI_SIZE, height: EMOJI_SIZE }]}
        onPress={() => onSelectEmoji(item)}
        activeOpacity={0.6}
      >
        <Text style={styles.emojiText}>{item}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { height }]}>
      {/* Category Tab Bar + Backspace Button */}
      <View style={styles.headerBar}>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat: EmojiCategory) => {
            const isActive = cat.id === activeCategory;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveCategory(cat.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.tabIcon}>{cat.icon}</Text>
                {isActive ? <View style={styles.activeIndicator} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Backspace Button */}
        <TouchableOpacity
          style={styles.backspaceButton}
          onPress={onBackspace}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backspaceIcon}>⌫</Text>
        </TouchableOpacity>
      </View>

      {/* Category Label */}
      <View style={styles.categoryTitleRow}>
        <Text style={styles.categoryTitleText}>{currentCategory.label}</Text>
      </View>

      {/* Scrollable Emoji Grid */}
      <FlatList
        data={currentCategory.emojis}
        keyExtractor={(item, index) => `${activeCategory}_${index}_${item}`}
        renderItem={renderEmojiItem}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={28}
        maxToRenderPerBatch={28}
        windowSize={5}
        keyboardShouldPersistTaps="always"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgCardSolid,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgBase,
    height: 44,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 8,
  },
  tabIcon: {
    fontSize: 18,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 18,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.accentPrimary,
  },
  backspaceButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspaceIcon: {
    fontSize: 20,
    color: colors.textMuted,
  },
  categoryTitleRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.bgCardSolid,
  },
  categoryTitleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  emojiItem: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 3,
  },
  emojiText: {
    fontSize: 26,
  },
});
