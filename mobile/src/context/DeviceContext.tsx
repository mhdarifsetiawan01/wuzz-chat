/**
 * WuzzChat Device Context
 * Manages device identity lifecycle and platform metadata.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { deviceIdService } from '../services/deviceIdService';

interface DeviceContextType {
  deviceId: string | null;
  platform: 'android' | 'ios';
  isReady: boolean;
}

const DeviceContext = createContext<DeviceContextType>({
  deviceId: null,
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  isReady: false,
});

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    async function initDevice() {
      try {
        const id = await deviceIdService.getOrCreateDeviceId();
        if (mounted) {
          setDeviceId(id);
          setIsReady(true);
        }
      } catch (err) {
        console.error('[DeviceContext] Failed to initialize device ID:', err);
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    initDevice();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <DeviceContext.Provider
      value={{
        deviceId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        isReady,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
};

export function useDevice(): DeviceContextType {
  return useContext(DeviceContext);
}
