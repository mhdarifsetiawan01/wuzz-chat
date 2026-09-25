/**
 * WuzzChat Auth Context
 * Coordinates user authentication state, session lifecycle, and WebSocket bridge.
 * Adheres to docs/MOBILE_INTEGRATION_GUIDE.md Section 2B.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/auth';
import { ApiError, LoginRequest, RegisterRequest, User } from '../api/types';
import { deviceIdService } from '../services/deviceIdService';
import { secureStorage } from '../services/secureStorage';
import { websocketClient } from '../services/websocket';
import { useDevice } from './DeviceContext';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionReplacedMessage: string | null;
  login: (credentials: Omit<LoginRequest, 'device_id'>) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  dismissSessionAlert: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  sessionReplacedMessage: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  dismissSessionAlert: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { deviceId, isReady: isDeviceReady } = useDevice();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionReplacedMessage, setSessionReplacedMessage] = useState<string | null>(null);

  // Setup WebSocket session replaced handler
  useEffect(() => {
    websocketClient.onSessionReplaced((reason) => {
      console.warn('[AuthContext] Session replacement triggered:', reason);
      // Purge local credentials
      secureStorage.clearSession();
      setUser(null);
      setToken(null);
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
          // Optimistically restore session
          if (mounted) {
            setToken(savedToken);
            setUser(savedUser);
          }

          // Verify with server in background
          try {
            const freshUser = await authApi.getMe();
            if (mounted) {
              setUser(freshUser);
              await secureStorage.setUserData(freshUser);
              // Connect WebSocket
              const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
              websocketClient.reset();
              websocketClient.connect(savedToken, currentDeviceId);
            }
          } catch (err: any) {
            // If token expired or unauthorized (401), clean up
            if (err?.status === 401) {
              console.warn('[AuthContext] Stored token expired, clearing session.');
              await secureStorage.clearSession();
              if (mounted) {
                setToken(null);
                setUser(null);
              }
            } else {
              // Network error or offline - keep cached session and attempt connect
              const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
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
  }, [isDeviceReady, deviceId]);

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

        // Connect WebSocket singleton
        websocketClient.reset();
        websocketClient.connect(response.token, currentDeviceId);
      } catch (err) {
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [deviceId]
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

        // Connect WebSocket singleton
        websocketClient.reset();
        websocketClient.connect(response.token, currentDeviceId);
      } catch (err) {
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [deviceId]
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentDeviceId = deviceId || (await deviceIdService.getOrCreateDeviceId());
      // Disconnect socket immediately
      websocketClient.disconnect();

      // Notify server (best effort with 30s timeout)
      try {
        await authApi.logout(currentDeviceId);
      } catch {
        // Continue logout locally even if server call fails
      }

      // Purge local storage
      await secureStorage.clearSession();
      setUser(null);
      setToken(null);
      setSessionReplacedMessage(null);
      websocketClient.reset();
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  const dismissSessionAlert = useCallback(() => {
    setSessionReplacedMessage(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        sessionReplacedMessage,
        login,
        register,
        logout,
        dismissSessionAlert,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
