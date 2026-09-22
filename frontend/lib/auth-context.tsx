'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { apiRequest } from './api'

import type { User } from './types'

import { unsubscribeFromPushNotifications, saveAuthTokenToCache, clearAuthTokenFromCache } from './pushNotification'
import { clearAllMessageCache } from './messageCache'
import { getOrCreateDeviceId } from './crypto/keyStore'

/**
 * Mendeteksi nama ramah perangkat dari User-Agent browser.
 * Digunakan sebagai label perangkat di halaman manajemen device.
 * @returns string — contoh: "Chrome on Windows", "Safari on iPhone"
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web Browser'

  const ua = navigator.userAgent.toLowerCase()

  // Deteksi OS
  let os = 'Unknown OS'
  if (ua.includes('windows')) os = 'Windows'
  else if (ua.includes('iphone')) os = 'iPhone'
  else if (ua.includes('ipad')) os = 'iPad'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('mac os')) os = 'Mac'
  else if (ua.includes('linux')) os = 'Linux'

  // Deteksi browser
  let browser = 'Browser'
  if (ua.includes('edg/')) browser = 'Edge'
  else if (ua.includes('chrome') && !ua.includes('chromium')) browser = 'Chrome'
  else if (ua.includes('firefox')) browser = 'Firefox'
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari'
  else if (ua.includes('opera') || ua.includes('opr/')) browser = 'Opera'

  return `${browser} on ${os}`
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (token: string, user: User) => void
  logout: () => Promise<void>
  localLogout: () => void
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: () => {},
  logout: async () => {},
  localLogout: () => {},
  updateUser: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load session on start
    const savedToken = localStorage.getItem('wuzz_auth_token')
    const savedUser = localStorage.getItem('wuzz_user_profile')

    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser)
        setToken(savedToken)
        setUser(parsedUser)
        saveAuthTokenToCache(savedToken, parsedUser.id)
        
        // Sync fresh profile from server
        apiRequest<User>('/api/auth/me').then(({ data, error, status }) => {
          if (data) {
            setUser(data)
            localStorage.setItem('wuzz_user_profile', JSON.stringify(data))
          } else if (status === 401) {
            // Token benar-benar kadaluarsa / tidak valid
            logout()
          } else {
            console.warn('[Auth] Gagal sync profile terkini (koneksi lambat / offline):', error)
          }
        })
      } catch {
        logout()
      }
    }
    setIsLoading(false)
  }, [])

  const login = (newToken: string, newUser: User) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('wuzz_auth_token', newToken)
    localStorage.setItem('wuzz_user_profile', JSON.stringify(newUser))
    saveAuthTokenToCache(newToken, newUser.id)
  }

  const localLogout = () => {
    setToken(null)
    setUser(null)
    clearAuthTokenFromCache()
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wuzz_auth_token')
      localStorage.removeItem('wuzz_user_profile')
    }
  }

  const logout = async () => {
    // 1. Ambil snapshot token dan deviceId sebelum storage lokal dibersihkan
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') : null
    const deviceId = typeof window !== 'undefined' ? getOrCreateDeviceId() : ''

    // 2. SYNCHRONOUS LOCAL-FIRST PURGE (0ms Guarantee):
    // Hapus kredensial di localStorage dan state React seketika.
    // Menjamin sesi lama langsung musnah dan tidak akan auto-redirect ke /chat jika terjadi timeout atau interupsi.
    localLogout()

    // 3. Beritahu backend dengan timeout terkelola 30 detik (AbortController)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      try {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            ...(savedToken ? { Authorization: `Bearer ${savedToken}` } : {}),
            ...(deviceId ? { 'X-Device-ID': deviceId } : {}),
          },
          body: JSON.stringify({ device_id: deviceId }),
        })
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      console.warn('[Auth] Gagal atau timeout saat memberitahu server saat logout (lanjut pembersihan lokal):', err)
    }

    // 4. Unsubscribe push notifications & bersihkan cache pesan
    try {
      await unsubscribeFromPushNotifications()
    } catch (err) {
      console.warn('[Auth] Gagal unsubscribe push saat logout:', err)
    }
    try {
      await clearAllMessageCache()
    } catch (err) {
      console.warn('[Auth] Gagal membersihkan message cache saat logout:', err)
    }
  }

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser)
    localStorage.setItem('wuzz_user_profile', JSON.stringify(updatedUser))
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, localLogout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

