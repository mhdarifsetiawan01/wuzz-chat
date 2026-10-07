/**
 * Tampilan murni onboarding Google (tanpa hook konteks/navigasi/modal) supaya bisa dipratinjau dan diganti desainnya
 * tanpa menyentuh logika. Perilaku (memanggil API, menangani konflik perangkat) ada di GoogleOnboardingScreen.
 *
 * Mengganti desain: ubah berkas ini dan/atau copy.ts. Properti tidak perlu berubah selama kontraknya sama.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AgeConsentCheckbox } from '../../components/AgeConsentCheckbox';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Input } from '../../components/Input';
import { OptionCard } from '../../components/OptionCard';
import { GoogleAccountChip } from '../../components/google/GoogleAccountChip';
import { colors, radius, spacing, typography } from '../../theme';
import type { UsernameHint } from '../../utils/usernameRules';
import { onboardingCopy as copy } from './copy';

export type OnboardingStep = 'choose' | 'new' | 'link';

export interface GoogleOnboardingViewProps {
  step: OnboardingStep;
  email?: string;
  username: string;
  displayName: string;
  password: string;
  ageConfirmed: boolean;
  usernameHint: UsernameHint;
  errorMessage: string | null;
  isLoading: boolean;
  onChangeUsername: (v: string) => void;
  onChangeDisplayName: (v: string) => void;
  onChangePassword: (v: string) => void;
  onToggleAgeConfirmed: () => void;
  onSelectStep: (step: Exclude<OnboardingStep, 'choose'>) => void;
  onSubmitNew: () => void;
  onSubmitLink: () => void;
  onBack: () => void;
  onOpenSupport: () => void;
}

const HEADER: Record<OnboardingStep, { title: string; subtitle: string }> = {
  choose: copy.choose,
  new: copy.newAccount,
  link: copy.link,
};

export const GoogleOnboardingView: React.FC<GoogleOnboardingViewProps> = (p) => {
  const header = HEADER[p.step];
  const showUsernameError = p.usernameHint.state === 'error';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        {p.step !== 'choose' && (
          <TouchableOpacity
            onPress={p.onBack}
            disabled={p.isLoading}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
            accessibilityRole="button"
            accessibilityLabel={copy.back}
            style={styles.backRow}
          >
            <Icon name="back" size={18} color={colors.accentHover} />
            <Text style={styles.backText}>{copy.back}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.identity}>
          <Text style={styles.eyebrow}>{copy.signedInAs}</Text>
          <GoogleAccountChip email={p.email} />
        </View>

        <Text style={styles.title}>{header.title}</Text>
        <Text style={styles.subtitle}>{header.subtitle}</Text>

        {p.errorMessage && (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <Text style={styles.errorBannerText}>{p.errorMessage}</Text>
          </View>
        )}

        {p.step === 'choose' && (
          <View style={styles.options}>
            <OptionCard
              icon="userPlus"
              title={copy.choose.newOption.title}
              description={copy.choose.newOption.description}
              onPress={() => p.onSelectStep('new')}
            />
            <OptionCard
              icon="link"
              title={copy.choose.linkOption.title}
              description={copy.choose.linkOption.description}
              onPress={() => p.onSelectStep('link')}
            />
            <TouchableOpacity onPress={p.onBack} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>{copy.cancel}</Text>
            </TouchableOpacity>
          </View>
        )}

        {p.step === 'new' && (
          <View style={styles.form}>
            <Input
              label={copy.newAccount.usernameLabel}
              placeholder={copy.newAccount.usernamePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
              value={p.username}
              onChangeText={p.onChangeUsername}
              error={showUsernameError ? p.usernameHint.message : null}
              hint={p.usernameHint.message}
            />
            <Input
              label={copy.newAccount.displayNameLabel}
              placeholder={copy.newAccount.displayNamePlaceholder}
              value={p.displayName}
              onChangeText={p.onChangeDisplayName}
            />
            <AgeConsentCheckbox
              checked={p.ageConfirmed}
              disabled={p.isLoading}
              hasError={!!p.errorMessage && !p.ageConfirmed}
              onToggle={p.onToggleAgeConfirmed}
            />
            <Button title={copy.newAccount.submit} isLoading={p.isLoading} onPress={p.onSubmitNew} />
          </View>
        )}

        {p.step === 'link' && (
          <View style={styles.form}>
            <Input
              label={copy.link.usernameLabel}
              placeholder={copy.link.usernamePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              value={p.username}
              onChangeText={p.onChangeUsername}
            />
            <Input
              label={copy.link.passwordLabel}
              placeholder={copy.link.passwordPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={p.password}
              onChangeText={p.onChangePassword}
            />
            <Button title={copy.link.submit} isLoading={p.isLoading} onPress={p.onSubmitLink} />

            <View style={styles.helpBox}>
              <Icon name="info" size={18} color={colors.textSecondary} />
              <View style={styles.helpTexts}>
                <Text style={styles.helpTitle}>{copy.link.forgotTitle}</Text>
                <Text style={styles.helpBody}>{copy.link.forgotBody}</Text>
                <TouchableOpacity onPress={p.onOpenSupport} hitSlop={8} accessibilityRole="link">
                  <Text style={styles.helpLink}>{copy.link.contactSupport}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xxl,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginBottom: spacing.lg },
  backText: { ...typography.captionBold, color: colors.accentHover },
  identity: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  eyebrow: { ...typography.caption, color: colors.textMuted },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { ...typography.bodySecondary, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  errorBanner: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorError,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: { ...typography.caption, color: colors.colorError, fontWeight: '500' },
  options: { gap: spacing.md },
  form: {},
  cancel: { alignSelf: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  cancelText: { ...typography.captionBold, color: colors.textSecondary },
  helpBox: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgInput,
  },
  helpTexts: { flex: 1 },
  helpTitle: { ...typography.captionBold, color: colors.textPrimary },
  helpBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  helpLink: { ...typography.captionBold, color: colors.accentHover, marginTop: spacing.sm },
});
