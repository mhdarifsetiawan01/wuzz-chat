/**
 * Favorit obrolan — disimpan lokal di perangkat (per user), belum disinkronkan ke server.
 * Yang disimpan hanya daftar room id berurutan sesuai waktu ditambahkan.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { secureStorage } from '../services/secureStorage';

const MAX_FAVORITES = 12;

function storageKey(userId: string): string {
  // SecureStore hanya menerima [A-Za-z0-9._-]
  return `wuzz_favorite_chats_${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

export function useFavoriteChats(userId?: string) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    idsRef.current = [];
    setFavoriteIds([]);
    if (!userId) return;

    secureStorage
      .getItem(storageKey(userId))
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const ids = parsed.filter((v): v is string => typeof v === 'string');
          idsRef.current = ids;
          setFavoriteIds(ids);
        }
      })
      .catch(() => {
        // Data rusak/tak terbaca: mulai dari daftar kosong.
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    (ids: string[]) => {
      idsRef.current = ids;
      setFavoriteIds(ids);
      if (userId) {
        secureStorage.setItem(storageKey(userId), JSON.stringify(ids)).catch(() => {});
      }
    },
    [userId]
  );

  /** Mengembalikan false bila batas favorit tercapai. */
  const toggleFavorite = useCallback(
    (roomId: string): boolean => {
      const current = idsRef.current;
      if (current.includes(roomId)) {
        persist(current.filter((id) => id !== roomId));
        return true;
      }
      if (current.length >= MAX_FAVORITES) return false;
      persist([...current, roomId]);
      return true;
    },
    [persist]
  );

  return { favoriteIds, toggleFavorite, maxFavorites: MAX_FAVORITES };
}
