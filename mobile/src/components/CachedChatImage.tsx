import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { mediaCache } from '../services/mediaCache';
import { mediaDownloadFeedback } from '../utils/mediaDownloadFeedback';
import { useTheme, useThemedStyles, ColorTokens, spacing } from '../theme';

interface Props {
  url: string;
  messageId: string;
  fileName?: string;
  fileSize?: number;
  allowLocalSource?: boolean;
  onReady?: (uri: string) => void;
  onPress?: (uri: string) => void;
  onLongPress?: () => void;
}

/** Chat attachments have one transfer owner. expo-image only decodes the completed local file. */
export function CachedChatImage({ url, messageId, fileName, fileSize, allowLocalSource, onReady, onPress, onLongPress }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ source: string; uri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uri = result?.source === url ? result.uri : null;

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setResult(null);
    mediaCache.downloadToCache(url, messageId, fileName, { expectedSize: fileSize, allowLocalSource, signal: controller.signal })
      .then((local) => {
        if (controller.signal.aborted) return;
        setResult({ source: url, uri: local });
        readyRef.current?.(local);
      }).catch((err) => {
        if (controller.signal.aborted) return;
        const feedback = mediaDownloadFeedback(err, 'Gambar');
        if (feedback) setError(feedback.title);
      });
    return () => controller.abort();
  }, [url, messageId, fileName, fileSize, allowLocalSource, attempt]);

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.88}
      accessibilityLabel={error ? `${error}. Ketuk untuk mencoba lagi` : uri ? 'Buka gambar' : 'Mengunduh gambar'}
      onPress={() => error ? setAttempt((n) => n + 1) : uri && onPress?.(uri)}
      onLongPress={onLongPress}
      delayLongPress={280}
    >
      {uri && !error ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={messageId}
          onError={() => setError('Gambar tidak dapat dibuka')} />
      ) : (
        <View style={styles.placeholder}>
          {error ? <Text style={styles.error}>{error}{'\n'}Ketuk untuk mencoba lagi</Text> :
            <ActivityIndicator color={colors.accentPrimary} />}
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, width: '100%', height: '100%', backgroundColor: colors.bgInput },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.sm },
  error: { color: colors.textSecondary, fontSize: 11, textAlign: 'center' },
});
