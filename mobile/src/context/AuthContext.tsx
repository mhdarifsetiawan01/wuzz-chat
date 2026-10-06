/**
 * WuzzChat Auth Context
 * Coordinates user authentication state, session lifecycle, and WebSocket bridge.
 * Adheres to docs/MOBILE_INTEGRATION_GUIDE.md Section 2B.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { authApi } from '../api/auth';
import {
  ApiError,
  AuthTokenResponse,
  GoogleNotLinkedResponse,
  LoginRequest,
  OwnershipProof,
  RegisterRequest,
  User,
} from '../api/types';
import { updatePublicKey, resetPublicKey } from '../api/users';
import { E2EEKeyPair, generateE2EEKeyPair } from '../services/crypto';
import { deviceIdService } from '../services/deviceIdService';
import { signInWithGoogle, signOutGoogleLocal } from '../services/googleAuth';
import { mediaCache } from '../services/mediaCache';
import { notificationService } from '../services/notificationService';
import { secureStorage } from '../services/secureStorage';
import { clearFeedPosts, clearUserCache } from '../services/sqliteStorage';
import { websocketClient } from '../services/websocket';
import { shouldRefreshToken } from '../utils/jwt';
import { useDevice } from './DeviceContext';

export type E2EEStatus = 'uninitialized' | 'loading' | 'ready' | 'conflict' | 'error';

/** Hasil login Google: sesi terbentuk, atau akun Google belum tertaut sehingga pengguna harus memilih daftar/tautkan. */
export type GoogleSignInOutcome =
  | { status: 'signed_in' }
  | { status: 'not_linked'; linkToken: string; email?: string; expiresInSec: number };

/** Opsi perangkat untuk login Google (konfirmasi mengganti perangkat lama saat batas 2 perangkat tercapai). */
export interface GoogleLoginOptions {
  confirm_override?: boolean;
  kick_device_id?: string;
}

/** Bukti kepemilikan: string dianggap password (kompatibel dengan pemanggil lama). */
export type ProofInput = string | OwnershipProof;

export function normalizeProof(input: ProofInput): OwnershipProof {
  return typeof input === 'string' ? { password: input } : input;
}

export function isGoogleNotLinked(res: unknown): res is GoogleNotLinkedResponse {
  return (res as GoogleNotLinkedResponse | null)?.code === 'GOOGLE_NOT_LINKED' && !!(res as GoogleNotLinkedResponse).link_token;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionReplacedMessage: string | null;
  e2eeKeyPair: E2EEKeyPair | null;
  e2eeStatus: E2EEStatus;
  initE2EEKeys: () => Promise<void>;
  resetE2EEKeys: (proof?: ProofInput) => Promise<void>;
  importTransferredKeyPair: (pair: E2EEKeyPair) => Promise<void>;
  login: (credentials: Omit<LoginRequest, 'device_id'>) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  /** Menampilkan pemilih akun Google lalu login. Mengembalikan ID token agar percobaan ulang (konflik perangkat) tak perlu pemilih lagi. */
  loginWithGoogle: (options?: GoogleLoginOptions & { idToken?: string }) => Promise<(GoogleSignInOutcome & { idToken: string }) | null>;
  /** Membuat akun baru (tanpa password) dari link_token hasil loginWithGoogle. */
  registerWithGoogle: (payload: { linkToken: string; username: string; displayName?: string }) => Promise<void>;
  /** Menautkan akun Google (link_token) ke akun lama dengan username + password, lalu login. */
  linkGoogleToExistingAccount: (payload: { linkToken: string; username: string; password: string } & GoogleLoginOptions) => Promise<void>;
  /** Menautkan Google ke akun yang sedang login (Pengaturan). false = pengguna membatalkan pemilih akun. */
  linkGoogleToCurrentAccount: () => Promise<boolean>;
  logout: () => Promise<void>;
  deleteAccount: (proof: ProofInput) => Promise<void>;
  dismissSessionAlert: () => void | Promise<void>;
  cancelKeyConflict: () => void | Promise<void>;
  updateCurrentUser: (updatedUser: User) => Promise<void>;
}

/**
 * Menghapus data lokal akun dari SQLite (pesan plaintext, percakapan, log panggilan, teman, feed). Dipakai di setiap jalur
 * keluar dari sesi agar data tidak tertinggal di HP. TIDAK menyentuh kunci E2EE (diatur masing-masing jalur) maupun berkas
 * media wuzzchat_media (sering satu-satunya salinan karena server menghapus berkas fisik setelah ACK; lokasinya
 * deterministik dari id pesan jadi ditemukan lagi saat login).
 */
async function clearLocalAccountData(userId: string | undefined | null): Promise<void> {
  if (!userId) return;
  try {
    await clearUserCache(userId);
    await clearFeedPosts(userId);
  } catch (err) {
    console.warn('[AuthContext] Failed to clear local data:', err);
  }
}

/**
 * Dipanggil setelah login/register sukses. Bila sesi sebelumnya berakhir karena token kedaluwarsa dan akun yang masuk
 * sekarang berbeda, data lokal akun lama dihapus (isolasi antar akun). Akun yang sama memakai ulang cache-nya.
 */
async function purgeStaleAccountData(newUserId: string): Promise<void> {
  try {
    const expiredUserId = await secureStorage.getExpiredUserId();
    if (!expiredUserId) return;
    if (expiredUserId !== newUserId) {
      await clearLocalAccountData(expiredUserId);
    }
    await secureStorage.deleteExpiredUserId();
  } catch (err) {
    console.warn('[AuthContext] Failed to purge stale account data:', err);
  }
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  sessionReplacedMessage: null,
  e2eeKeyPair: null,
  e2eeStatus: 'uninitialized',
  initE2EEKeys: async () => {},
  resetE2EEKeys: async () => {},
  importTransferredKeyPair: async () => {},
  login: async () => {},
  register: async () => {},
  loginWithGoogle: async () => null,
  registerWithGoogle: async () => {},
  linkGoogleToExistingAccount: async () => {},
  linkGoogleToCurrentAccount: async () => false,
  logout: async () => {},
  deleteAccount: async () => {},
  dismissSessionAlert: () => {},
  cancelKeyConflict: () => {},
  updateCurrentUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { deviceId, isReady: isDeviceReady } = useDevice();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionReplacedMessage, setSessionReplacedMessage] = useState<string | null>(null);
  const [e2eeKeyPair, setE2eeKeyPair] = useState<E2EEKeyPair | null>(null);
  const [e2eeStatus, setE2eeStatus] = useState<E2EEStatus>('uninitialized');


  const initE2EEForUser = useCallback(async (targetUserId: string, targetDeviceId: string) => {
    console.log('[AuthContext] initE2EEForUser starting for user:', targetUserId);
    setE2eeStatus('loading');
    try {
      const savedPair = await secureStorage.getE2EEKeyPair(targetUserId);
      if (savedPair) {
        console.log('[AuthContext] Found existing local keypair, syncing with server...');
        setE2eeKeyPair(savedPair);
        try {
          await updatePublicKey(savedPair.publicKeyJWK, targetDeviceId);
          setE2eeStatus('ready');
          console.log('[AuthContext] Local keypair synced successfully with server.');
        } catch (err: any) {
          if (
            err?.status === 409 ||
            err?.title === 'KEY_ALREADY_REGISTERED' ||
            err?.detail?.includes('KEY_ALREADY_REGISTERED')
          ) {
            console.warn('[AuthContext] E2EE key conflict: Local key does not match server key. Clearing stale key.');
            await secureStorage.deleteE2EEKeyPair(targetUserId);
            setE2eeKeyPair(null);
            setE2eeStatus('conflict');
          } else {
            console.log('[AuthContext] Server sync skipped or offline, using local key.');
            setE2eeStatus('ready');
          }
        }
        return;
      }

      // No local keypair: generate new keypair
      console.log('[AuthContext] No local keypair found. Generating fresh E2EE keypair...');
      const newPair = generateE2EEKeyPair();
      try {
        await updatePublicKey(newPair.publicKeyJWK, targetDeviceId);
        await secureStorage.setE2EEKeyPair(targetUserId, newPair);
        setE2eeKeyPair(newPair);
        setE2eeStatus('ready');
        console.log('[AuthContext] New E2EE keypair registered and saved locally.');
      } catch (err: any) {
        if (
          err?.status === 409 ||
          err?.title === 'KEY_ALREADY_REGISTERED' ||
          err?.detail?.includes('KEY_ALREADY_REGISTERED')
        ) {
          console.warn('[AuthContext] Device conflict during key registration. Account already registered.');
          setE2eeStatus('conflict');
        } else {
          // Fallback save locally
          await secureStorage.setE2EEKeyPair(targetUserId, newPair);
          setE2eeKeyPair(newPair);
          setE2eeStatus('ready');
          console.log('[AuthContext] Saved locally as offline fallback.');
        }
      }
    } catch (err) {
      console.error('[AuthContext] initE2EEForUser failed:', err);
      setE2eeStatus('error');
    }
  }, []);

  // Auto-init E2EE keys whenever user is authenticated but e2eeKeyPair is not yet loaded and status is uninitialized
  useEffect(() => {
    if (!user?.id || e2eeKeyPair || e2eeStatus !== 'uninitialized') return;
    const currentDeviceId = deviceId || '';
    if (currentDeviceId) {
      initE2EEForUser(user.id, currentDeviceId);
    }
  }, [user?.id, e2eeKeyPair, e2eeStatus, deviceId, initE2EEForUser]);

  const initE2EEKeys = useCallback(async () => {
    if (!user?.id) return;
    const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
    await initE2EEForUser(user.id, currentDeviceId);
  }, [user?.id, deviceId, initE2EEForUser]);

  const resetE2EEKeys = useCallback(async (proof?: ProofInput) => {
    if (!user?.id) throw new Error('User tidak terotentikasi');
    setE2eeStatus('loading');
    try {
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      const freshPair = generateE2EEKeyPair();
      await resetPublicKey(freshPair.publicKeyJWK, currentDeviceId, proof === undefined ? undefined : normalizeProof(proof));
      await secureStorage.setE2EEKeyPair(user.id, freshPair);
      setE2eeKeyPair(freshPair);
      setE2eeStatus('ready');
    } catch (err) {
      console.error('[AuthContext] resetE2EEKeys failed:', err);
      setE2eeStatus('error');
      throw err;
    }
  }, [user?.id, deviceId]);

  const importTransferredKeyPair = useCallback(async (pair: E2EEKeyPair) => {
    if (!user?.id) throw new Error('User tidak terotentikasi');
    setE2eeStatus('loading');
    try {
      await secureStorage.setE2EEKeyPair(user.id, pair);
      setE2eeKeyPair(pair);
      setE2eeStatus('ready');
      console.log('[AuthContext] Transferred keypair imported and active.');

      // Re-establish WebSocket connection after QR transfer.
      // The JWT token is already stored from the original login; retrieve it and
      // reconnect so that ChatScreen joinRoom succeeds immediately after transfer.
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      const storedToken = await secureStorage.getAuthToken();
      if (storedToken) {
        websocketClient.reset();
        websocketClient.connect(storedToken, currentDeviceId);
        console.log('[AuthContext] WebSocket reconnected after QR key transfer.');
      }
    } catch (err) {
      console.error('[AuthContext] importTransferredKeyPair failed:', err);
      setE2eeStatus('error');
      throw err;
    }
  }, [user?.id, deviceId]);

  // Sliding renewal: perpanjang token saat sisa umurnya < 50% (saat app dibuka dan tiap kembali ke foreground).
  // Kegagalan apa pun (offline, timeout, 401 sesi) diabaikan: token lama tetap berlaku sampai habis dan logout
  // hanya dipicu oleh respons 401 pada request biasa.
  useEffect(() => {
    if (!token || !user?.id) return;
    let cancelled = false;
    let inFlight = false;

    const run = async () => {
      if (inFlight || !shouldRefreshToken(token)) return;
      inFlight = true;
      try {
        const res = await authApi.refresh();
        if (cancelled || !res.refreshed || !res.token) return;
        await secureStorage.setAuthToken(res.token);
        websocketClient.updateToken(res.token);
        setToken(res.token);
      } catch (err) {
        console.warn('[AuthContext] Token refresh skipped:', err);
      } finally {
        inFlight = false;
      }
    };

    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [token, user?.id]);

  // Setup WebSocket session replaced handler
  useEffect(() => {
    websocketClient.onSessionReplaced((reason) => {
      console.warn('[AuthContext] Session replacement triggered:', reason);
      // Unsubscribe push token from backend
      notificationService.unsubscribeDevice().catch(() => {});
      // Purge local credentials
      secureStorage.clearSession();
      setUser((prev) => {
        if (prev?.id) {
          secureStorage.deleteE2EEKeyPair(prev.id).catch(() => {});
          clearLocalAccountData(prev.id);
        }
        return null;
      });
      setToken(null);
      setE2eeKeyPair(null);
      setE2eeStatus('conflict');
      setSessionReplacedMessage(reason || 'Akun Anda sedang aktif di perangkat lain. Sesi pada perangkat ini telah dihentikan.');
    });
  }, []);

  // Check saved session once device is ready
  useEffect(() => {
    if (!isDeviceReady) return;

    let mounted = true;

    async function checkExistingAuth() {
      try {
        const savedToken = await secureStorage.getAuthToken();
        const savedUser = await secureStorage.getUserData<User>();

        if (savedToken && savedUser) {
          // Optimistically restore session instantly (0ms splash screen release)
          if (mounted) {
            setToken(savedToken);
            setUser(savedUser);
            setIsLoading(false);
          }

          await secureStorage.setCurrentUserId(savedUser.id);

          const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
          // Init E2EE asynchronously
          initE2EEForUser(savedUser.id, currentDeviceId);

          // Register Push Notifications asynchronously
          notificationService.subscribeDevice().catch((err) => {
            console.warn('[AuthContext] Push subscribe on restore skipped:', err);
          });

          // Verify with server in background
          try {
            const freshUser = await authApi.getMe();
            if (mounted) {
              setUser(freshUser);
              await secureStorage.setUserData(freshUser);
              await secureStorage.setCurrentUserId(freshUser.id);
              // Connect WebSocket
              websocketClient.reset();
              websocketClient.connect(savedToken, currentDeviceId);
            }
          } catch (err: any) {
            // If token expired or unauthorized (401), clean up
            if (err?.status === 401) {
              console.warn('[AuthContext] Stored token expired, clearing session.');
              await notificationService.unsubscribeDevice().catch(() => {});
              await secureStorage.clearSession();
              // Token habis bukan logout sukarela: cache lokal dipertahankan agar login ulang tidak mengunduh ulang
              // seluruh riwayat dan pesan yang sudah terhapus di server tidak hilang. Dibersihkan di
              // purgeStaleAccountData() bila yang login berikutnya akun berbeda.
              await secureStorage.setExpiredUserId(savedUser.id);
              if (mounted) {
                setToken(null);
                setUser(null);
              }
            } else {
              // Network error or offline - keep cached session and attempt connect
              websocketClient.reset();
              websocketClient.connect(savedToken, currentDeviceId);
            }
          }
        }
      } catch (err) {
        console.error('[AuthContext] Failed to check saved auth:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    checkExistingAuth();

    return () => {
      mounted = false;
    };
  }, [isDeviceReady, deviceId, initE2EEForUser]);

  /**
   * Langkah bersama setelah server menerbitkan sesi (password maupun Google): simpan token, isolasi data akun lama,
   * inisialisasi kunci E2EE, daftar push, dan sambungkan WebSocket.
   */
  const startSession = useCallback(
    async (response: AuthTokenResponse, currentDeviceId: string, source: string) => {
      // Metode login dari server (akun Google-only atau berpassword) ikut disimpan di profil lokal.
      const sessionUser: User = {
        ...response.user,
        has_password: response.has_password ?? response.user.has_password,
        google_linked: response.google_linked ?? response.user.google_linked,
        google_link_required_by: response.google_link_required_by ?? response.user.google_link_required_by,
      };
      await secureStorage.setAuthToken(response.token);
      await secureStorage.setUserData(sessionUser);
      await secureStorage.setCurrentUserId(sessionUser.id);
      await purgeStaleAccountData(sessionUser.id);

      setToken(response.token);
      setUser(sessionUser);
      setSessionReplacedMessage(null);

      // Initialize E2EE Keys
      await initE2EEForUser(sessionUser.id, currentDeviceId);

      // Subscribe Push Notifications
      notificationService.subscribeDevice().catch((err) => {
        console.warn(`[AuthContext] Push subscribe on ${source} skipped:`, err);
      });

      // Connect WebSocket singleton
      websocketClient.reset();
      websocketClient.connect(response.token, currentDeviceId);
    },
    [initE2EEForUser]
  );

  const login = useCallback(
    async (credentials: Omit<LoginRequest, 'device_id'>) => {
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      const response = await authApi.login({
        ...credentials,
        device_id: currentDeviceId,
      });
      await startSession(response, currentDeviceId, 'login');
    },
    [deviceId, startSession]
  );

  const register = useCallback(
    async (payload: RegisterRequest) => {
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      const response = await authApi.register(payload);
      await startSession(response, currentDeviceId, 'register');
    },
    [deviceId, startSession]
  );

  const loginWithGoogle = useCallback(
    async (options: GoogleLoginOptions & { idToken?: string } = {}) => {
      // Percobaan ulang (mis. konfirmasi ganti perangkat) memakai ID token yang sama: tanpa pemilih akun kedua.
      let idToken = options.idToken;
      if (!idToken) {
        const identity = await signInWithGoogle();
        if (!identity) return null; // pengguna membatalkan
        idToken = identity.idToken;
      }

      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      const response = await authApi.googleSignIn(idToken, {
        device_id: currentDeviceId,
        confirm_override: options.confirm_override,
        kick_device_id: options.kick_device_id,
      });

      if (isGoogleNotLinked(response)) {
        return {
          status: 'not_linked' as const,
          linkToken: response.link_token,
          email: response.email,
          expiresInSec: response.expires_in,
          idToken,
        };
      }
      await startSession(response, currentDeviceId, 'google login');
      return { status: 'signed_in' as const, idToken };
    },
    [deviceId, startSession]
  );

  const registerWithGoogle = useCallback(
    async ({ linkToken, username, displayName }: { linkToken: string; username: string; displayName?: string }) => {
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      const response = await authApi.googleRegister({
        link_token: linkToken,
        username,
        display_name: displayName,
        device_id: currentDeviceId,
      });
      await startSession(response, currentDeviceId, 'google register');
    },
    [deviceId, startSession]
  );

  const linkGoogleToExistingAccount = useCallback(
    async ({
      linkToken,
      username,
      password,
      confirm_override,
      kick_device_id,
    }: { linkToken: string; username: string; password: string } & GoogleLoginOptions) => {
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      const response = await authApi.googleLink({
        link_token: linkToken,
        username,
        password,
        device_id: currentDeviceId,
        confirm_override,
        kick_device_id,
      });
      await startSession(response, currentDeviceId, 'google link');
    },
    [deviceId, startSession]
  );

  const linkGoogleToCurrentAccount = useCallback(async () => {
    const identity = await signInWithGoogle();
    if (!identity) return false;
    await authApi.linkGoogleToAccount(identity.idToken);
    // Segarkan profil agar google_linked/has_password terbaru tersimpan.
    try {
      const fresh = await authApi.getMe();
      setUser(fresh);
      await secureStorage.setUserData(fresh);
    } catch (err) {
      console.warn('[AuthContext] Refresh profil setelah menautkan Google gagal:', err);
    }
    return true;
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      // Disconnect socket immediately
      websocketClient.disconnect();

      // Unsubscribe Push Notifications
      try {
        await notificationService.unsubscribeDevice();
      } catch (err) {
        console.warn('[AuthContext] Push unsubscribe during logout failed:', err);
      }

      // Notify server (best effort with 30s timeout)
      try {
        await authApi.logout(currentDeviceId);
      } catch {
        // Continue logout locally even if server call fails
      }

      // Trusted Device Pattern (matches Next.js frontend IndexedDB behavior):
      // Do NOT delete the local E2EE keypair on normal logout so that when the user logs back in
      // on this trusted phone, the existing key is retained and past messages decrypt cleanly
      // without needing to re-scan the QR code every time.
      await secureStorage.clearSession();
      signOutGoogleLocal().catch(() => {});
      const loggedOutUserId = user?.id;
      setUser(null);
      setToken(null);
      setE2eeKeyPair(null);
      setE2eeStatus('uninitialized');
      setSessionReplacedMessage(null);
      websocketClient.reset();

      // Data lokal akun dihapus; kunci E2EE dan media dipertahankan (lihat clearLocalAccountData). Dijalankan setelah state
      // di-reset: antrean tulis MessageContext sudah dibuang saat user berganti.
      await clearLocalAccountData(loggedOutUserId);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, user?.id]);

  /**
   * Hapus akun permanen: server menghapus data dulu (error 401 = password salah, dilempar ke pemanggil dan tidak ada
   * yang berubah), baru data lokal dibersihkan termasuk kunci E2EE dan media (tidak ada akun lagi yang bisa memakainya).
   */
  const deleteAccount = useCallback(
    async (proof: ProofInput) => {
      await authApi.deleteAccount(normalizeProof(proof));

      const deletedUserId = user?.id;
      websocketClient.disconnect();
      try {
        await notificationService.unsubscribeDevice();
      } catch {
        // Token push sudah dihapus server bersama akun
      }
      if (deletedUserId) {
        try {
          await secureStorage.deleteE2EEKeyPair(deletedUserId);
        } catch {}
      }
      await secureStorage.clearSession();
      signOutGoogleLocal().catch(() => {});
      setUser(null);
      setToken(null);
      setE2eeKeyPair(null);
      setE2eeStatus('uninitialized');
      setSessionReplacedMessage(null);
      websocketClient.reset();
      await clearLocalAccountData(deletedUserId);
      await mediaCache.clearAll();
    },
    [user?.id]
  );

  const dismissSessionAlert = useCallback(async () => {
    setSessionReplacedMessage(null);
    try {
      await secureStorage.clearSession();
    } catch {
      // Best-effort cleanup
    }
    websocketClient.reset();
  }, []);

  const cancelKeyConflict = useCallback(async () => {
    setIsLoading(true);
    try {
      // Disconnect socket locally
      websocketClient.disconnect();
      websocketClient.reset();

      // Unsubscribe push token locally
      notificationService.unsubscribeDevice().catch(() => {});

      // Clear local storage ONLY (Do NOT call remote authApi.logout to preserve primary device session)
      if (user?.id) {
        try {
          await secureStorage.deleteE2EEKeyPair(user.id);
        } catch {}
      }
      await secureStorage.clearSession();

      const cancelledUserId = user?.id;
      setUser(null);
      setToken(null);
      setE2eeKeyPair(null);
      setE2eeStatus('uninitialized');
      setSessionReplacedMessage(null);
      await clearLocalAccountData(cancelledUserId);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const updateCurrentUser = useCallback(async (updatedUser: User) => {
    setUser(updatedUser);
    await secureStorage.setUserData(updatedUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        sessionReplacedMessage,
        deleteAccount,
        e2eeKeyPair,
        e2eeStatus,
        initE2EEKeys,
        resetE2EEKeys,
        importTransferredKeyPair,
        login,
        register,
        loginWithGoogle,
        registerWithGoogle,
        linkGoogleToExistingAccount,
        linkGoogleToCurrentAccount,
        logout,
        dismissSessionAlert,
        cancelKeyConflict,
        updateCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
