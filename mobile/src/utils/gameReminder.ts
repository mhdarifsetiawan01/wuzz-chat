/**
 * Logika murni pengingat harian Wuzz Grid (tanpa React Native): jam dari server, jadwal beberapa hari ke depan,
 * dan kalimat yang bergantian. Penjadwalan notifikasi sebenarnya ada di services/gameReminder.ts.
 *
 * Aturan: satu pengingat per hari pada jam lokal perangkat; tidak ada pengingat hari ini bila puzzle sudah
 * selesai atau jamnya sudah lewat; hanya beberapa hari ke depan yang dijadwalkan (jadwal diperbarui setiap aplikasi
 * dibuka atau puzzle selesai), sehingga orang yang berhenti bermain hanya menerima beberapa pengingat lalu berhenti.
 */

export const DEFAULT_REMINDER_TIME = '19:00';

/** Jumlah hari ke depan yang dijadwalkan sekaligus. */
export const REMINDER_HORIZON_DAYS = 3;

/** Pengingat yang jamnya kurang dari ini dari sekarang dilewati (hindari notifikasi "langsung muncul"). */
const MIN_LEAD_MS = 60 * 1000;

export const REMINDER_TITLE = 'Wuzz Grid';

/**
 * Kalimat pengingat. {n} = nomor puzzle. Netral dan ajakan ringan: tanpa ancaman kehilangan streak, tanpa klaim
 * tentang apa yang dilakukan orang lain.
 */
export const REMINDER_MESSAGES: readonly string[] = [
  'Wuzz Grid #{n} sudah siap. Mau coba sebentar?',
  'Satu puzzle singkat untuk menyegarkan pikiran?',
  'Siapa yang tercepat hari ini? Wuzz Grid #{n} menunggu.',
  'Waktunya jeda kecil: Wuzz Grid #{n} siap dimainkan.',
  'Puzzle baru, kepala segar. Wuzz Grid #{n} sudah tersedia.',
  'Punya satu atau dua menit? Wuzz Grid #{n} cocok untuk itu.',
  'Bintang-bintang menunggu di grid hari ini. Mau menyusunnya?',
  'Wuzz Grid #{n} siap. Bisa selesai sekali duduk.',
];

export interface ReminderTime {
  hour: number;
  minute: number;
}

/** "19:00" -> {19, 0}. Nilai kosong atau tidak sah memakai jam bawaan. */
export function parseReminderTime(value?: string | null): ReminderTime {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((value ?? '').trim());
  if (!m) return parseReminderTime(DEFAULT_REMINDER_TIME);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Mengisi {n}; tanpa nomor, "Wuzz Grid #{n}" menjadi "Wuzz Grid". */
export function renderReminderMessage(template: string, number?: number | null): string {
  if (number && number > 0) return template.split('{n}').join(String(number));
  return template.split('Wuzz Grid #{n}').join('Wuzz Grid').split('{n}').join('');
}

/** Memilih kalimat berdasarkan hari kalender (bukan acak): hari berurutan tidak pernah memakai kalimat yang sama. */
export function reminderMessageForDay(date: Date, number?: number | null): string {
  const dayIndex = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return renderReminderMessage(REMINDER_MESSAGES[dayIndex % REMINDER_MESSAGES.length], number);
}

export interface PlannedReminder {
  at: Date;
  title: string;
  body: string;
}

export interface PlanOptions {
  now: Date;
  /** "HH:MM" dari server (reminder_time). */
  time?: string | null;
  /** Puzzle hari ini sudah selesai: pengingat hari ini dilewati. */
  finishedToday: boolean;
  /** Nomor puzzle hari ini; hari berikutnya = nomor + 1, dan seterusnya. */
  numberToday?: number | null;
  days?: number;
}

/** Menyusun pengingat untuk beberapa hari ke depan pada jam lokal perangkat. */
export function planReminders(opts: PlanOptions): PlannedReminder[] {
  const { now, finishedToday, numberToday } = opts;
  const days = opts.days ?? REMINDER_HORIZON_DAYS;
  const { hour, minute } = parseReminderTime(opts.time);
  const out: PlannedReminder[] = [];

  for (let offset = 0; out.length < days && offset < days + 2; offset++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute, 0, 0);
    if (offset === 0 && (finishedToday || at.getTime() - now.getTime() < MIN_LEAD_MS)) continue;
    out.push({
      at,
      title: REMINDER_TITLE,
      body: reminderMessageForDay(at, numberToday ? numberToday + offset : null),
    });
  }
  return out;
}
