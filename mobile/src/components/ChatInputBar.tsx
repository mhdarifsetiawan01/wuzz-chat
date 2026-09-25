/**
 * WuzzChat ChatInputBar Component
 * Auto-expanding chat text input bar with send button and safe area insets.
 */

import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface ChatInputBarProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const isSendActive = text.trim().length > 0 && !disabled;

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          placeholder="Ketik pesan..."
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
          editable={!disabled}
        />

        <TouchableOpacity
          style={[styles.sendButton, isSendActive ? styles.sendButtonActive : styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!isSendActive}
          activeOpacity={0.7}
        >
          <Text style={[styles.sendIcon, isSendActive ? styles.sendIconActive : styles.sendIconDisabled]}>
            ➤
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bgBase,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 8,
    paddingHorizontal: spacing.sm,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.bgInput,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendButtonActive: {
    backgroundColor: colors.accentPrimary,
  },
  sendButtonDisabled: {
    backgroundColor: colors.bgCardSolid,
  },
  sendIcon: {
    fontSize: 16,
    marginLeft: 2, // Centering arrow icon
  },
  sendIconActive: {
    color: '#ffffff',
  },
  sendIconDisabled: {
    color: colors.textMuted,
  },
});
