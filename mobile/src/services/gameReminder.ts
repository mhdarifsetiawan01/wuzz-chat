/**
 * Penjadwalan pengingat harian Wuzz Grid sebagai notifikasi LOKAL (tanpa server dan tanpa data baru).
 * - Pilihan menyalakan disimpan di perangkat per akun (pengingat melekat pada izin notifikasi perangkat ini).
 * - Jadwal beberapa hari ke depan dibuat ulang tiap aplikasi dibuka atau puzzle selesai; orang yang berhenti bermain
 *   hanya menerima beberapa pengingat lalu berhenti sendiri.
 * - Jam pengingat berasal dari server (reminder_time), jadi dapat diubah tanpa build baru.
 * Logika murni (jadwal dan kalimat) ada di utils/gameReminder.ts.
 */

import { Platform } from 'react-native';
import { GameToday } from '../api';
import { isExpoGo, notificationService } from './notificationService';
import { secureStorage } from './secureStorage';
import { planReminders } from '../utils/gameReminder';

const CHANNEL_ID = 'game-reminder';
const REMINDER_KIND = 'game_reminder';

/** SecureStore hanya menerima [A-Za-z0-9._-]. */
const flagKey = (userId: string) => `wuzz_game_reminder_${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

type NotificationsModule = typeof import('expo-notifications');

function notifications(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  if (isExpoGo() && Platform.OS === 'android') return null;
  try {
    return require('expo-notifications');
  } catch {
    return null;
  }
}

// Semua operasi jadwal diserialkan: kartu di Feed dan layar game bisa memicu sinkron bersamaan, dan tanpa antrean
// dua "batal lalu jadwalkan" yang berpotongan akan menghasilkan pengingat ganda.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

let lastSignature: string | null = null;

// Pilihan menyala disimpan di memori setelah dibaca sekali per akun, supaya sinkron yang dipicu tiap Feed terlihat tidak
// membaca SecureStore (Keystore Android) berulang kali.
const enabledCache = new Map<string, boolean>();

async function ownScheduled(N: NotificationsModule) {
  const scheduled = await N.getAllScheduledNotificationsAsync();
  return scheduled.filter((n) => (n.content?.data as Record<string, unknown> | undefined)?.kind === REMINDER_KIND);
}

async function cancelAll(N: NotificationsModule): Promise<void> {
  await Promise.all((await ownScheduled(N)).map((n) => N.cancelScheduledNotificationAsync(n.identifier)));
}

async function ensureChannel(N: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Pengingat Wuzz Grid',
    description: 'Pengingat harian untuk puzzle Wuzz Grid (bisa dimatikan di aplikasi).',
    importance: N.AndroidImportance.DEFAULT,
    enableVibrate: false,
    showBadge: false,
  });
}

export const gameReminder = {
  /** Apakah pengguna menyalakan pengingat di perangkat ini. */
  async isEnabled(userId: string): Promise<boolean> {
    const cached = enabledCache.get(userId);
    if (cached !== undefined) return cached;
    try {
      const on = (await secureStorage.getItem(flagKey(userId))) === '1';
      enabledCache.set(userId, on);
      return on;
    } catch {
      return false; // jangan simpan kegagalan baca di cache; coba lagi pada sinkron berikutnya
    }
  },

  /** Membatalkan semua pengingat game di perangkat (dipakai saat keluar/ganti akun). */
  cancelAll(): Promise<void> {
    return serialized(async () => {
      lastSignature = null;
      const N = notifications();
      if (!N) return;
      try {
        await cancelAll(N);
      } catch (err) {
        console.warn('[GameReminder] cancelAll gagal:', err);
      }
    });
  },

  /**
   * Menyelaraskan jadwal dengan keadaan terbaru. Aman dipanggil berulang: jadwal yang sama tidak dibuat ulang, dan
   * tanpa pilihan menyala, tanpa izin, atau fitur dimatikan server maka semua jadwal dibatalkan.
   */
  sync(userId: string, today: GameToday): Promise<void> {
    return serialized(async () => {
      const N = notifications();
      if (!N) return;
      try {
        const wanted = today.enabled && (await this.isEnabled(userId)) && (await notificationService.getPermissionStatus()) === 'granted';
        if (!wanted) {
          if (lastSignature !== 'off') await cancelAll(N);
          lastSignature = 'off';
          return;
        }

        const attemptStatus = today.attempt?.status;
        const plan = planReminders({
          now: new Date(),
          time: today.reminder_time,
          finishedToday: attemptStatus === 'solved' || attemptStatus === 'suspicious',
          numberToday: today.number,
        });
        const signature = `${userId}|${plan.map((p) => `${p.at.getTime()}:${p.body}`).join('|')}`;
        // Jadwal yang sama hanya dilewati bila alarm di sistem memang masih ada sebanyak rencana. Alarm bisa hilang di
        // luar kendali aplikasi (dibersihkan sistem atau penghemat baterai); memeriksanya membuat jadwal pulih sendiri
        // saat aplikasi dibuka, dengan satu panggilan baca yang murah.
        if (signature === lastSignature && (await ownScheduled(N)).length === plan.length) return;

        await ensureChannel(N);
        await cancelAll(N);
        for (const p of plan) {
          await N.scheduleNotificationAsync({
            content: {
              title: p.title,
              body: p.body,
              data: { type: REMINDER_KIND, kind: REMINDER_KIND },
              sound: false,
              ...(Platform.OS === 'android' ? { color: '#0462E8' } : {}),
            },
            trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL_ID },
          });
        }
        lastSignature = signature;
      } catch (err) {
        lastSignature = null;
        console.warn('[GameReminder] sync gagal:', err);
      }
    });
  },

  /**
   * Menyalakan pengingat: meminta izin notifikasi bila perlu. 'denied' berarti pengguna menolak izin dan pilihan
   * TIDAK disimpan.
   */
  async enable(userId: string, today: GameToday): Promise<'enabled' | 'denied'> {
    let status = await notificationService.getPermissionStatus();
    if (status !== 'granted') status = await notificationService.requestPermissions();
    if (status !== 'granted') return 'denied';
    await secureStorage.setItem(flagKey(userId), '1');
    enabledCache.set(userId, true);
    await this.sync(userId, today);
    return 'enabled';
  },

  async disable(userId: string): Promise<void> {
    enabledCache.set(userId, false);
    try {
      await secureStorage.deleteItem(flagKey(userId));
    } catch {
      // abaikan
    }
    await this.cancelAll();
  },
};
