/**
 * WuzzChat Mobile UI - AppDialogHost
 * Merender dialog dari services/dialog (pengganti Alert.alert). Dipasang sekali di root App.
 * Tampilannya mengikuti ActionConfirmModal.
 */

import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';
import {
  DialogButton,
  DialogRequest,
  dismissCurrentDialog,
  subscribeDialog,
} from '../services/dialog';
import { IconText } from './IconText';
import { Button } from './Button';

type Tone = 'danger' | 'success' | 'warning' | 'info';

function resolveTone(request: DialogRequest): { tone: Tone; icon: string } {
  const title = request.title.toLowerCase();
  if (request.buttons.some((b) => b.style === 'destructive')) return { tone: 'danger', icon: '⚠️' };
  if (/^(gagal|error|kesalahan|tidak (dapat|bisa|ditemukan))|gagal/.test(title)) {
    return { tone: 'danger', icon: '❌' };
  }
  if (/sukses|berhasil|terkirim|tersimpan/.test(title)) return { tone: 'success', icon: '✅' };
  if (/izin|perhatian|peringatan|penuh|batas/.test(title)) return { tone: 'warning', icon: '⚠️' };
  return { tone: 'info', icon: 'ℹ️' };
}

const toneStyle = (tone: Tone) => {
  switch (tone) {
    case 'danger':
      return styles.iconDangerBg;
    case 'success':
      return styles.iconSuccessBg;
    case 'warning':
      return styles.iconWarningBg;
    default:
      return styles.iconInfoBg;
  }
};

export const AppDialogHost: React.FC = () => {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => subscribeDialog(setRequest), []);

  if (!request) return null;

  const cancelButton = request.buttons.find((b) => b.style === 'cancel');
  // Cancel selalu paling bawah, urutan tombol lain dipertahankan.
  const ordered = [...request.buttons.filter((b) => b.style !== 'cancel'), ...(cancelButton ? [cancelButton] : [])];
  const firstDefaultIndex = ordered.findIndex((b) => b.style !== 'cancel' && b.style !== 'destructive');
  const { tone, icon } = resolveTone(request);

  const close = (button?: DialogButton) => {
    dismissCurrentDialog();
    if (button?.onPress) {
      // Ditunda satu tick agar dialog berikutnya (bila onPress memanggil showAlert) tidak bentrok dengan penutupan.
      setTimeout(() => {
        Promise.resolve(button.onPress!()).catch(() => {});
      }, 0);
    }
  };

  const cancelable = request.options?.cancelable ?? (request.buttons.length <= 1 || !!cancelButton);

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        if (cancelable) close(cancelButton);
      }}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.iconContainer, toneStyle(tone)]}>
            <IconText style={styles.icon}>{icon}</IconText>
          </View>

          <Text style={styles.title}>{request.title}</Text>

          {!!request.message && (
            <ScrollView style={styles.messageScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.description}>{request.message}</Text>
            </ScrollView>
          )}

          <View style={styles.actionContainer}>
            {ordered.map((button, index) => {
              const variant =
                button.style === 'destructive'
                  ? 'danger'
                  : button.style === 'cancel'
                    ? 'secondary'
                    : index === firstDefaultIndex
                      ? 'primary'
                      : 'secondary';
              return (
                <Button
                  key={`${index}-${button.text ?? ''}`}
                  title={button.text ?? 'OK'}
                  variant={variant}
                  onPress={() => close(button)}
                  style={styles.actionBtn}
                />
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xxl,
    alignItems: 'center',
    ...shadows.modal,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconWarningBg: {
    backgroundColor: colors.tintWarning10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  iconDangerBg: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.tintError20,
  },
  iconSuccessBg: {
    backgroundColor: colors.tintSuccess10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  iconInfoBg: {
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.tintAccent20,
  },
  icon: {
    fontSize: 26,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  messageScroll: {
    flexGrow: 0,
    width: '100%',
  },
  description: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.xs,
  },
  actionContainer: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  actionBtn: {
    width: '100%',
    height: 48,
    borderRadius: radius.lg,
  },
});
