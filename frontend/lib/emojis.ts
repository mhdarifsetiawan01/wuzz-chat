/**
 * Katalog Emoticon Modular Wuzz Chat (WhatsApp & Telegram Standard)
 * Memudahkan penambahan kategori baru, emoji kustom, dan reuse di seluruh aplikasi.
 */

export interface EmojiCategory {
  id: string
  label: string
  icon: string
  emojis: string[]
}

export const EMOJI_CATEGORIES: Record<string, EmojiCategory> = {
  faces: {
    id: 'faces',
    label: 'Wajah & Emosi',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
      '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
      '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦',
      '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞'
    ],
  },
  gestures: {
    id: 'gestures',
    label: 'Tangan & Gestur',
    icon: '👍',
    emojis: [
      '👍', '👎', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✌️', '🤞',
      '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚',
      '🖐️', '🖖', '👋', '💪', '🖕', '✍️', '💅', '🤳', '💃', '🕺',
      '🚶', '🏃', '🧎', '🧍', '🫂', '👀', '👁️', '👂', '👃', '✨'
    ],
  },
  hearts: {
    id: 'hearts',
    label: 'Hati & Simbol',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '🔥',
      '💥', '💯', '✅', '❌', '⚠️', '⚡', '🎉', '🎊', '🎈', '🎁',
      '🎂', '🏆', '🥇', '🥈', '🥉', '👑', '🌟', '⭐', '💫', '💎'
    ],
  },
  objects: {
    id: 'objects',
    label: 'Makanan & Objek',
    icon: '☕',
    emojis: [
      '☕', '🍵', '🧃', '🥤', '🍺', '🍻', '🍕', '🍔', '🍟', '🍜',
      '🍣', '🍦', '🍩', '🍪', '🍫', '🍿', '🚀', '✈️', '🚗', '🛵',
      '💡', '📱', '💻', '⌚', '📷', '🎥', '🔒', '🔑', '🎵', '🎶',
      '⚽', '🏀', '🎮', '🎲', '📚', '📌', '📎', '💬', '📢', '🔔'
    ],
  },
  animals: {
    id: 'animals',
    label: 'Hewan & Alam',
    icon: '🐱',
    emojis: [
      '🐱', '🐶', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅',
      '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌',
      '🐞', '🐜', '🦟', '🐢', '🐍', '🐙', '🦑', '🦐', '🦀', '🐡',
      '🐠', '🐟', '🐬', '🐳', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍',
      '🐘', '🦏', '🦛', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄',
      '🌸', '🌺', '🌹', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴',
      '🍀', '🍁', '🍂', '🍃', '🍄', '🌍', '🌙', '☀️', '⭐', '🌈'
    ],
  },
}

/**
 * Mengambil seluruh kategori emoji
 */
export function getEmojiCategories(): EmojiCategory[] {
  return Object.values(EMOJI_CATEGORIES)
}
