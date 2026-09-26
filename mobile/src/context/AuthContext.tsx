/**
 * WuzzChat Auth Context
 * Coordinates user authentication state, session lifecycle, and WebSocket bridge.
 * Adheres to docs/MOBILE_INTEGRATION_GUIDE.md Section 2B.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/auth';
import { ApiError, LoginRequest, RegisterRequest, User } from '../api/types';
import { updatePublicKey, resetPublicKey } from '../api/users';
import { E2EEKeyPair, generateE2EEKeyPair } from '../services/crypto';
import { deviceIdService } from '../services/deviceIdService';
import { notificationService } from '../services/notificationService';
import { secureStorage } from '../services/secureStorage';
import { websocketClient } from '../services/websocket';
import { useDevice } from './DeviceContext';

export type E2EEStatus = 'uninitialized' | 'loading' | 'ready' | 'conflict' | 'error';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionReplacedMessage: string | null;
  e2eeKeyPair: E2EEKeyPair | null;
  e2eeStatus: E2EEStatus;
  initE2EEKeys: () => Promise<void>;
  resetE2EEKeys: (password?: string) => Promise<void>;
  login: (credentials: Omit<LoginRequest, 'device_id'>) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  dismissSessionAlert: () => void | Promise<void>;
  cancelKeyConflict: () => void | Promise<void>;
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
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  dismissSessionAlert: () => {},
  cancelKeyConflict: () => {},
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
            console.warn('[AuthContext] E2EE key conflict: Account active on another device');
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

  // Auto-init E2EE keys whenever user is authenticated but e2eeKeyPair is not yet loaded
  useEffect(() => {
    if (!user?.id || e2eeKeyPair || e2eeStatus === 'loading') return;
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

  const resetE2EEKeys = useCallback(async (password?: string) => {
    if (!user?.id) throw new Error('User tidak terotentikasi');
    setE2eeStatus('loading');
    try {
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      const freshPair = generateE2EEKeyPair();
      await resetPublicKey(freshPair.publicKeyJWK, currentDeviceId, password);
      await secureStorage.setE2EEKeyPair(user.id, freshPair);
      setE2eeKeyPair(freshPair);
      setE2eeStatus('ready');
    } catch (err) {
      console.error('[AuthContext] resetE2EEKeys failed:', err);
      setE2eeStatus('error');
      throw err;
    }
  }, [user?.id, deviceId]);

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

  const login = useCallback(
    async (credentials: Omit<LoginRequest, 'device_id'>) => {
      setIsLoading(true);
      try {
        const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
        const response = await authApi.login({
          ...credentials,
          device_id: currentDeviceId,
        });

        await secureStorage.setAuthToken(response.token);
        await secureStorage.setUserData(response.user);

        setToken(response.token);
        setUser(response.user);
        setSessionReplacedMessage(null);

        // Initialize E2EE Keys
        await initE2EEForUser(response.user.id, currentDeviceId);

        // Subscribe Push Notifications
        notificationService.subscribeDevice().catch((err) => {
          console.warn('[AuthContext] Push subscribe on login skipped:', err);
        });

        // Connect WebSocket singleton
        websocketClient.reset();
        websocketClient.connect(response.token, currentDeviceId);
      } catch (err) {
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [deviceId, initE2EEForUser]
  );

  const register = useCallback(
    async (payload: RegisterRequest) => {
      setIsLoading(true);
      try {
        const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
        const response = await authApi.register(payload);

        await secureStorage.setAuthToken(response.token);
        await secureStorage.setUserData(response.user);

        setToken(response.token);
        setUser(response.user);
        setSessionReplacedMessage(null);

        // Initialize E2EE Keys
        await initE2EEForUser(response.user.id, currentDeviceId);

        // Subscribe Push Notifications
        notificationService.subscribeDevice().catch((err) => {
          console.warn('[AuthContext] Push subscribe on register skipped:', err);
        });

        // Connect WebSocket singleton
        websocketClient.reset();
        websocketClient.connect(response.token, currentDeviceId);
      } catch (err) {
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [deviceId, initE2EEForUser]
  );

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

      // Purge local storage
      if (user?.id) {
        try {
          await secureStorage.deleteE2EEKeyPair(user.id);
        } catch {}
      }
      await secureStorage.clearSession();
      setUser(null);
      setToken(null);
      setE2eeKeyPair(null);
      setE2eeStatus('uninitialized');
      setSessionReplacedMessage(null);
      websocketClient.reset();
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, user?.id]);

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

      setUser(null);
      setToken(null);
      setE2eeKeyPair(null);
      setE2eeStatus('uninitialized');
      setSessionReplacedMessage(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        sessionReplacedMessage,
        e2eeKeyPair,
        e2eeStatus,
        initE2EEKeys,
        resetE2EEKeys,
        login,
        register,
        logout,
        dismissSessionAlert,
        cancelKeyConflict,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
