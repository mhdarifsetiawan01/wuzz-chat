/**
 * Pengganti Alert.alert bawaan sistem. Tanda tangannya sama (title, message, buttons, options)
 * sehingga bisa dipanggil dari mana saja, termasuk di luar komponen. Dirender oleh <AppDialogHost />
 * yang dipasang sekali di root App.
 */

export interface DialogButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
}

export interface DialogOptions {
  /** Boleh ditutup dengan tombol kembali (Android). Default: hanya bila tombolnya ≤ 1 atau ada tombol cancel. */
  cancelable?: boolean;
}

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  options?: DialogOptions;
}

type Listener = (current: DialogRequest | null) => void;

let nextId = 1;
let current: DialogRequest | null = null;
const queue: DialogRequest[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(current));
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: DialogOptions
): void {
  const request: DialogRequest = {
    id: nextId++,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
    options,
  };
  if (current) {
    queue.push(request);
    return;
  }
  current = request;
  emit();
}

/** Dipanggil host setelah dialog ditutup; menampilkan antrean berikutnya bila ada. */
export function dismissCurrentDialog(): void {
  current = queue.shift() ?? null;
  emit();
}

export function subscribeDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
