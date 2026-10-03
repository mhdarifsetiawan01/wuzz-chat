/**
 * WuzzChat IconText — teks dengan ikon vektor Wuzz di depannya.
 *
 * Dua cara pakai:
 *  1. Eksplisit : <IconText icon="mic" style={styles.label}>Pesan Suara</IconText>
 *  2. Otomatis  : <IconText style={styles.label}>🎙️ Pesan Suara</IconText>
 *     Emoji di awal string dipetakan ke ikon Wuzz (lihat EMOJI_TO_ICON) dan
 *     dibuang dari teks. Berguna untuk string data/pratinjau yang memang
 *     menyimpan emoji (mis. '🔒 Pesan terenkripsi'), tanpa mengubah datanya.
 *
 * Ukuran & warna ikon mengikuti `fontSize` dan `color` dari style teks.
 * Bila tidak ada ikon yang cocok, dirender sebagai <Text> biasa.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextProps, TextStyle } from 'react-native';
import { colors } from '../theme';
import { Icon } from './Icon';
import type { IconName } from './icons/registry';

export const EMOJI_TO_ICON: Record<string, IconName> = {
  '💬': 'chat',
  '🌐': 'globe',
  '📞': 'call',
  '⚙': 'settings',
  '🔒': 'lock',
  '🔐': 'lock',
  '✓': 'check',
  '✅': 'checkCircle',
  '✕': 'close',
  '✗': 'close',
  '←': 'back',
  '🔍': 'search',
  '📎': 'attach',
  '🎙': 'mic',
  '🎤': 'mic',
  '➤': 'send',
  '📷': 'camera',
  '🖼': 'image',
  '📌': 'pin',
  '🕒': 'clock',
  '👥': 'users',
  '👤': 'user',
  '👑': 'crown',
  '🛡': 'shield',
  '⚠': 'alert',
  '🔔': 'bell',
  '✦': 'sparkle',
  '📢': 'megaphone',
  '📰': 'article',
  '📬': 'mail',
  '🏛': 'forum',
  '📱': 'device',
  '📋': 'copy',
  '➕': 'plus',
  '✏': 'edit',
  '🗑': 'trash',
  '↩': 'reply',
  '↪': 'forwardMessage',
  '📤': 'share',
  '↗': 'external',
  '🚫': 'ban',
  '🚪': 'exit',
  '📄': 'file',
  '📂': 'folder',
  '🔗': 'link',
  '🎵': 'music',
  '🎥': 'video',
  '▶': 'play',
  '💾': 'storage',
  '🗄': 'storage',
  '🧹': 'broom',
  '🔇': 'mute',
  '🔊': 'volume',
  '🔈': 'volumeLow',
  '🔕': 'bellOff',
  '📵': 'phoneOff',
  '💻': 'laptop',
  '🖥': 'laptop',
  '❤': 'heartFilled',
  '🤍': 'heart',
  '⭐': 'star',
  '⚡': 'bolt',
  '💡': 'bulb',
  '😊': 'smile',
  '📍': 'mapPin',
  '💼': 'briefcase',
  '🚨': 'alert',
  '❌': 'close',
  '▲': 'chevronUp',
  '▼': 'chevronDown',
  '↑': 'arrowUp',
  '↓': 'arrowDown',
  '↖': 'arrowUpLeft',
  '↙': 'arrowDownLeft',
  'ℹ': 'info',
  '⋮': 'more',
  '⏸': 'pause',
  '⏳': 'hourglass',
  '⌛': 'hourglass',
  '⏱': 'clock',
  '⌨': 'keyboard',
  '🔦': 'bolt',
  '📸': 'camera',
  '📝': 'edit',
  '🐧': 'laptop',
  // Komposit (dicocokkan lebih dulu daripada emoji tunggal)
  '👥➕': 'userPlus',
  '👤❌': 'userMinus',
  '🔍❓': 'search',
};

const EMOJI_KEYS = Object.keys(EMOJI_TO_ICON)
  .map((key) => Array.from(key))
  .sort((a, b) => b.length - a.length);

interface IconTextProps extends Omit<TextProps, 'style'> {
  /** Ikon eksplisit. Bila kosong, dideteksi dari emoji di awal teks. */
  icon?: IconName;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

// Properti layout yang harus ikut ke wadah (bukan ke teks) agar posisi tidak berubah.
const LAYOUT_KEYS = [
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'maxWidth',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'position', 'top', 'bottom', 'left', 'right',
] as const;

const GAP_PER_FONT = 0.4;

function flattenChildren(children: React.ReactNode): string | null {
  const parts = React.Children.toArray(children);
  if (parts.length === 0) return null;
  let out = '';
  for (const part of parts) {
    if (typeof part === 'string' || typeof part === 'number') out += String(part);
    else return null;
  }
  return out;
}

function detectLeadingIcon(text: string): { icon: IconName; rest: string } | null {
  const chars = Array.from(text);
  for (const key of EMOJI_KEYS) {
    let ci = 0;
    let ki = 0;
    while (ki < key.length && ci < chars.length) {
      if (chars[ci] === '\uFE0F') { ci += 1; continue; }
      if (chars[ci] !== key[ki]) break;
      ci += 1;
      ki += 1;
    }
    if (ki < key.length) continue;
    while (chars[ci] === '\uFE0F') ci += 1;
    return { icon: EMOJI_TO_ICON[key.join('')], rest: chars.slice(ci).join('').replace(/^\s+/, '') };
  }
  return null;
}

export const IconText: React.FC<IconTextProps> = ({
  icon,
  style,
  children,
  numberOfLines,
  ...textProps
}) => {
  let name = icon;
  let content: React.ReactNode = children;

  if (!name) {
    const flat = flattenChildren(children);
    const found = flat != null ? detectLeadingIcon(flat) : null;
    if (!found) {
      return (
        <Text style={style} numberOfLines={numberOfLines} {...textProps}>
          {children}
        </Text>
      );
    }
    name = found.icon;
    content = found.rest;
  }

  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
  const color = typeof flat.color === 'string' ? flat.color : colors.textPrimary;

  const containerStyle: Record<string, unknown> = {};
  const textStyle: Record<string, unknown> = { ...flat };
  for (const key of LAYOUT_KEYS) {
    if (flat[key] !== undefined) {
      containerStyle[key] = flat[key];
      delete textStyle[key];
    }
  }

  const justifyContent =
    flat.textAlign === 'center' ? 'center' : flat.textAlign === 'right' ? 'flex-end' : 'flex-start';
  const hasContent = !(content === '' || content == null);

  return (
    <View style={[styles.row, { justifyContent }, containerStyle]}>
      <Icon name={name} size={Math.round(fontSize * 1.2)} color={color} />
      {hasContent ? (
        <Text
          style={[textStyle, { marginLeft: Math.round(fontSize * GAP_PER_FONT), flexShrink: 1 }]}
          numberOfLines={numberOfLines}
          {...textProps}
        >
          {content}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
