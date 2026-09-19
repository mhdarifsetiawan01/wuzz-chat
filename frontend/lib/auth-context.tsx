'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { apiRequest } from './api'

import type { User } from './types'

import { unsubscribeFromPushNotifications } from './pushNotification'
import { clearAllMessageCache } from './messageCache'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (token: string, user: User) => void
  logout: () => Promise<void>
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: () => {},
  logout: async () => {},
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
        setToken(savedToken)
        setUser(JSON.parse(savedUser))
        
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
  }

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.warn('[Auth] Gagal memberitahu server saat logout:', err)
    }
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
    setToken(null)
    setUser(null)
    localStorage.removeItem('wuzz_auth_token')
    localStorage.removeItem('wuzz_user_profile')
  }

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser)
    localStorage.setItem('wuzz_user_profile', JSON.stringify(updatedUser))
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

