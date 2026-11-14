/**
 * WuzzChat Mobile UI — InviteScreen (Tautan Undangan Grup Privat, V2 Tahap 1)
 * Dibuka dari https://chat.wuzzhub.id/join/<token> atau wuzzchat://join/<token>.
 * Menampilkan pratinjau minimal (nama, avatar, jumlah anggota) lalu "Ajukan Bergabung"; admin grup yang memutuskan.
 *
 * Grup berbayar (V2 Tahap 2a, mode "paid"): menampilkan harga dan Saldo Star, lalu "Bayar N Star & Masuk" (bayar dan masuk
 * atomik di server). Kunci idempoten disimpan per niat bayar dan dipakai ulang saat mencoba lagi setelah timeout, sehingga
 * Star tidak terpotong dua kali. Tidak ada tombol beli Star di Tahap 2a.
 *
 * Ketahanan jaringan: setiap permintaan punya AbortController (dibatalkan saat layar ditutup), tombol dikunci selama
 * permintaan berjalan, dan status selalu diambil dari jawaban server (POST join idempoten, aman diulang).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { invitesApi, InvitePreview } from '../api/invites';
import { formatStars, newIdempotencyKey, starsApi } from '../api/stars';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useTheme, useThemedStyles, ColorTokens } from '../theme';
import { showAlert } from '../services/dialog';

export interface InviteScreenProps {
  token: string;
  onBack: () => void;
  /** Membuka chat grup setelah pengguna menjadi anggota. */
  onOpenGroup: (group: { id: string; title: string; avatarUrl?: string }) => void;
}

type LoadError = 'invalid' | 'network' | null;

/** "sekitar 5 jam" / "sekitar 20 menit" untuk sisa jeda pengajuan ulang. */
export function formatRetryAfter(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'sebentar lagi';
  if (seconds < 3600) return `sekitar ${Math.max(1, Math.ceil(seconds / 60))} menit lagi`;
  return `sekitar ${Math.ceil(seconds / 3600)} jam lagi`;
}

export const InviteScreen: React.FC<InviteScreenProps> = ({ token, onBack, onOpenGroup }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [isActing, setIsActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Niat bayar yang belum mendapat jawaban pasti (mis. timeout): kunci yang sama dipakai ulang untuk harga yang sama.
  const payIntentRef = useRef<{ key: string; price: number } | null>(null);

  const newController = () => {
    abortRef.current?.abort();
    const c = new AbortController();
    abortRef.current = c;
    return c;
  };

  const load = useCallback(
    async (silent = false) => {
      const controller = newController();
      if (!silent) {
        setIsLoading(true);
        setLoadError(null);
      }
      try {
        const p = await invitesApi.preview(token, controller.signal);
        if (controller.signal.aborted) return;
        setPreview(p);
        setLoadError(null);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        // Saat penyegaran diam-diam gagal, data lama tetap ditampilkan.
        if (silent) return;
        setLoadError(err?.status === 404 ? 'invalid' : 'network');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Saat kembali ke aplikasi (mis. setelah menerima notifikasi persetujuan), segarkan status pengajuan.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && preview && preview.my_status !== 'member') load(true);
    });
    return () => sub.remove();
  }, [load, preview]);

  const handleRequest = async () => {
    if (isActing || !preview) return;
    setIsActing(true);
    setNotice(null);
    const controller = newController();
    try {
      const res = await invitesApi.requestJoin(token, controller.signal);
      setPreview({ ...preview, my_status: res.status, retry_after_seconds: undefined });
    } catch (err: any) {
      if (controller.signal.aborted) return;
      if (err?.code === 'rejoin_cooldown') {
        setPreview({ ...preview, my_status: 'rejected', retry_after_seconds: err?.data?.retry_after_seconds });
      } else if (err?.status === 404) {
        setLoadError('invalid');
      } else if (err?.code === 'payment_required') {
        // Grup baru saja dijadikan berbayar: muat ulang agar harga tampil.
        load(true);
      } else if (err?.code === 'too_many_pending') {
        setNotice('Grup ini sedang menerima terlalu banyak permohonan. Coba lagi nanti.');
      } else if (err?.status === 429) {
        setNotice('Terlalu banyak percobaan. Coba lagi beberapa saat lagi.');
      } else {
        // Timeout/jaringan: server mungkin sudah mencatat pengajuan; POST idempoten sehingga aman dicoba lagi.
        setNotice(err?.detail || 'Gagal mengirim permohonan. Periksa koneksi lalu coba lagi.');
      }
    } finally {
      if (!controller.signal.aborted) setIsActing(false);
    }
  };

  const doPay = async (price: number) => {
    if (isActing || !preview) return;
    setIsActing(true);
    setNotice(null);
    const intent =
      payIntentRef.current && payIntentRef.current.price === price ? payIntentRef.current : { key: newIdempotencyKey(), price };
    payIntentRef.current = intent;
    const controller = newController();
    try {
      const res = await starsApi.purchase(token, price, intent.key, controller.signal);
      payIntentRef.current = null;
      setPreview({ ...preview, my_status: 'member', my_balance: res.balance });
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const definitive = err?.status >= 400 && err?.status < 500 && err?.status !== 408 && err?.status !== 429;
      if (definitive) payIntentRef.current = null;
      if (err?.code === 'insufficient_stars') {
        setNotice('Saldo Star Anda tidak cukup untuk masuk grup ini.');
        load(true);
      } else if (err?.code === 'price_changed') {
        setNotice('Harga grup baru saja berubah. Periksa harga terbaru lalu coba lagi.');
        load(true);
      } else if (err?.status === 404) {
        // Token dicabut atau grup tidak lagi berbayar: muat ulang untuk menampilkan keadaan terbaru.
        load();
      } else if (err?.status === 429) {
        setNotice('Terlalu banyak percobaan. Coba lagi beberapa saat lagi.');
      } else {
        // Timeout/jaringan: server mungkin sudah memproses; mencoba lagi memakai kunci yang sama sehingga tidak terpotong dua kali.
        setNotice('Pembayaran belum terkonfirmasi. Periksa koneksi lalu ketuk lagi; Star tidak akan terpotong dua kali.');
      }
    } finally {
      if (!controller.signal.aborted) setIsActing(false);
    }
  };

  const handlePay = () => {
    if (isActing || !preview || preview.price_stars == null) return;
    const price = preview.price_stars;
    showAlert(
      `Bayar ${formatStars(price)}?`,
      `${formatStars(price)} akan dipotong dari Saldo Star Anda dan Anda langsung masuk ke grup ini. Akses berlaku selama Anda tidak dikeluarkan dari grup.`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Bayar & Masuk', onPress: () => void doPay(price) },
      ]
    );
  };

  const handleCancel = () => {
    if (isActing || !preview) return;
    showAlert('Batalkan Permohonan?', 'Admin tidak akan melihat permohonan Anda lagi. Anda bisa mengajukan ulang kapan saja.', [
      { text: 'Tidak', style: 'cancel' },
      {
        text: 'Batalkan',
        style: 'destructive',
        onPress: async () => {
          setIsActing(true);
          setNotice(null);
          const controller = newController();
          try {
            await invitesApi.cancelRequest(token, controller.signal);
            setPreview({ ...preview, my_status: 'none' });
          } catch (err: any) {
            if (controller.signal.aborted) return;
            if (err?.code === 'request_not_found') {
              // Sudah diputuskan admin atau sudah dibatalkan: ambil status terbaru.
              load(true);
            } else {
              setNotice(err?.detail || 'Gagal membatalkan permohonan. Coba lagi.');
            }
          } finally {
            if (!controller.signal.aborted) setIsActing(false);
          }
        },
      },
    ]);
  };

  const renderPaid = () => {
    if (!preview || preview.price_stars == null) return null;
    const price = preview.price_stars;
    const balance = preview.my_balance ?? 0;
    const enough = balance >= price;
    return (
      <>
        <View style={styles.priceBox}>
          <View style={styles.priceRow}>
            <Icon name="star" size={18} color={colors.accentPrimary} />
            <Text style={styles.priceText}>{formatStars(price)}</Text>
          </View>
          <Text style={styles.balanceText}>Saldo Star Anda: {formatStars(balance)}</Text>
        </View>
        <Text style={styles.statusText}>
          Grup ini berbayar. Bayar sekali dengan Star untuk langsung masuk; akses berlaku selama Anda tidak dikeluarkan dari grup.
        </Text>
        {preview.my_status === 'pending' ? (
          <Text style={styles.statusText}>Permohonan bergabung Anda sebelumnya masih menunggu keputusan admin.</Text>
        ) : null}
        <TouchableOpacity
          style={[styles.primaryBtn, (isActing || !enough) && styles.btnDisabled]}
          onPress={handlePay}
          disabled={isActing || !enough}
          accessibilityRole="button"
          accessibilityState={{ disabled: isActing || !enough }}
        >
          {isActing ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={styles.primaryBtnText}>Bayar {formatStars(price)} & Masuk</Text>
          )}
        </TouchableOpacity>
        {!enough ? <Text style={styles.statusText}>Saldo Star Anda belum cukup untuk masuk grup ini.</Text> : null}
        {preview.my_status === 'pending' ? (
          <TouchableOpacity onPress={handleCancel} disabled={isActing} accessibilityRole="button" style={styles.linkBtn}>
            <Text style={styles.dangerLinkText}>Batalkan Permohonan</Text>
          </TouchableOpacity>
        ) : null}
      </>
    );
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      );
    }
    if (loadError === 'invalid') {
      return (
        <View style={styles.center}>
          <Icon name="link" size={40} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Tautan undangan tidak berlaku</Text>
          <Text style={styles.stateText}>
            Tautan ini mungkin sudah direset atau dimatikan admin grup. Minta tautan baru kepada admin.
          </Text>
        </View>
      );
    }
    if (loadError === 'network' || !preview) {
      return (
        <View style={styles.center}>
          <Icon name="alert" size={40} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Gagal memuat undangan</Text>
          <Text style={styles.stateText}>Periksa koneksi internet Anda lalu coba lagi.</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => load()} accessibilityRole="button">
            <Text style={styles.secondaryBtnText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const title = preview.title || 'Grup Privat';
    const isPaid = preview.mode === 'paid' && preview.price_stars != null;
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Avatar name={title} avatarUrl={preview.avatar_url} size={88} />
        <Text style={styles.groupTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          <Icon name="lock" size={14} color={colors.textSecondary} />
          <Text style={styles.metaText}>Grup Privat · {preview.member_count} anggota</Text>
        </View>

        {preview.my_status === 'member' && (
          <>
            <Text style={styles.statusText}>Anda sudah menjadi anggota grup ini.</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => onOpenGroup({ id: preview.group_id, title, avatarUrl: preview.avatar_url })}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Buka Grup</Text>
            </TouchableOpacity>
          </>
        )}

        {isPaid && preview.my_status !== 'member' && renderPaid()}

        {!isPaid && preview.my_status === 'none' && (
          <>
            <Text style={styles.statusText}>
              Anda diundang ke grup privat ini. Admin grup akan meninjau permohonan Anda sebelum Anda bisa masuk.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, isActing && styles.btnDisabled]}
              onPress={handleRequest}
              disabled={isActing}
              accessibilityRole="button"
            >
              {isActing ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Text style={styles.primaryBtnText}>Ajukan Bergabung</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {!isPaid && preview.my_status === 'pending' && (
          <>
            <View style={styles.pendingBadge}>
              <Icon name="hourglass" size={16} color={colors.colorWarningText} />
              <Text style={styles.pendingText}>Menunggu persetujuan admin</Text>
            </View>
            <Text style={styles.statusText}>
              Anda akan menerima notifikasi saat permohonan diputuskan. Grup akan muncul di daftar obrolan bila disetujui.
            </Text>
            <TouchableOpacity
              style={[styles.secondaryBtn, isActing && styles.btnDisabled]}
              onPress={() => load()}
              disabled={isActing}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryBtnText}>Periksa Status</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCancel} disabled={isActing} accessibilityRole="button" style={styles.linkBtn}>
              <Text style={styles.dangerLinkText}>Batalkan Permohonan</Text>
            </TouchableOpacity>
          </>
        )}

        {!isPaid && preview.my_status === 'rejected' && (
          <Text style={styles.statusText}>
            Permohonan Anda sebelumnya ditolak admin. Anda bisa mengajukan lagi {formatRetryAfter(preview.retry_after_seconds)}.
          </Text>
        )}

        {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Kembali">
          <Icon name="back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Undangan Grup</Text>
        <View style={styles.headerSpacer} />
      </View>
      {renderBody()}
    </View>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgSurface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderDefault,
    },
    headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    headerSpacer: { width: 24 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    stateTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    stateText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
    content: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 },
    groupTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginTop: 16 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    metaText: { fontSize: 14, color: colors.textSecondary },
    statusText: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', marginTop: 24 },
    primaryBtn: {
      alignSelf: 'stretch',
      marginTop: 24,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: colors.accentFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.textOnAccent },
    secondaryBtn: {
      alignSelf: 'stretch',
      marginTop: 20,
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: colors.tintAccent10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    secondaryBtnText: { fontSize: 15, fontWeight: '600', color: colors.accentPrimary },
    btnDisabled: { opacity: 0.6 },
    pendingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 24,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.tintWarning10,
    },
    pendingText: { fontSize: 14, fontWeight: '600', color: colors.colorWarningText },
    priceBox: {
      alignSelf: 'stretch',
      alignItems: 'center',
      marginTop: 24,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.tintAccent10,
    },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    priceText: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
    balanceText: { fontSize: 13, color: colors.textSecondary, marginTop: 6 },
    linkBtn: { marginTop: 16, padding: 8 },
    dangerLinkText: { fontSize: 14, fontWeight: '600', color: colors.colorErrorText },
    noticeText: { fontSize: 13, lineHeight: 19, color: colors.colorErrorText, textAlign: 'center', marginTop: 16 },
  });
