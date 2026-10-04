/**
 * WuzzChat Mobile - ChatHeaderStatus
 * Baris status di header chat: "sedang mengetik" + titik berdenyut selama ada yang mengetik, selain itu
 * `children` (subjudul biasa). State mengetik sengaja dipegang di komponen kecil ini, bukan di ChatScreen,
 * supaya layar besar itu tidak dirender ulang tiap indikator muncul/padam.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';
import { usePeerTyping } from '../hooks/usePeerTyping';
import { describeTypers } from '../utils/typingTracker';
import { TypingDots } from './TypingDots';

interface ChatHeaderStatusProps {
  roomId: string;
  isDirect: boolean;
  children: React.ReactNode;
}

export const ChatHeaderStatus: React.FC<ChatHeaderStatusProps> = ({ roomId, isDirect, children }) => {
  const typers = usePeerTyping(roomId);
  if (typers.length === 0) return <>{children}</>;

  return (
    <>
      <Text style={styles.text} numberOfLines={1}>
        {describeTypers(typers, isDirect)}
      </Text>
      <TypingDots color={colors.colorOnline} />
    </>
  );
};

const styles = StyleSheet.create({
  text: {
    fontSize: 12,
    color: colors.colorOnline,
    flexShrink: 1,
  },
});
