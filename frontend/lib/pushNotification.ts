import { apiRequest } from './api'

// Konversi Base64 URL-safe string ke Uint8Array untuk VAPID applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Periksa apakah browser saat ini mendukung Web Push & Service Worker
export function isPushNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Cek status perizinan notifikasi browser
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushNotificationSupported()) return 'unsupported'
  return Notification.permission
}

// Daftarkan Service Worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushNotificationSupported()) return null
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })
    try {
      await registration.update()
    } catch {}
    await navigator.serviceWorker.ready
    return registration
  } catch (err) {
    console.warn('[Push] Gagal mendaftarkan Service Worker:', err)
    return null
  }
}

// Ambil VAPID Public Key dari Backend
export async function fetchVAPIDPublicKey(): Promise<string | null> {
  const res = await apiRequest<{ public_key: string }>('/api/notifications/vapid-public-key')
  if (res.data?.public_key) {
    return res.data.public_key
  }
  return null
}

// Subscribe ke Push Notification
export async function subscribeToPushNotifications(): Promise<{ success: boolean; error?: string }> {
  if (!isPushNotificationSupported()) {
    return { success: false, error: 'Peramban ini tidak mendukung Web Push Notification' }
  }

  try {
    // 1. Minta izin notifikasi ke pengguna
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { success: false, error: 'Izin notifikasi ditolak oleh pengguna' }
    }

    // 2. Daftarkan Service Worker
    const registration = await registerServiceWorker()
    if (!registration) {
      return { success: false, error: 'Gagal menginisialisasi Service Worker' }
    }

    // 3. Ambil VAPID Public Key dari server
    const vapidPublicKey = await fetchVAPIDPublicKey()
    if (!vapidPublicKey) {
      return { success: false, error: 'Gagal mengambil VAPID Public Key dari server' }
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)

    // 4. Daftarkan subscription ke PushManager browser
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any,
      })
    }

    const subJSON = subscription.toJSON()
    if (!subJSON.endpoint || !subJSON.keys?.p256dh || !subJSON.keys?.auth) {
      return { success: false, error: 'Subscription data tidak lengkap' }
    }

    // 5. Kirim payload subscription ke backend Go
    const saveRes = await apiRequest('/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        platform: 'web',
        endpoint: subJSON.endpoint,
        keys: {
          p256dh: subJSON.keys.p256dh,
          auth: subJSON.keys.auth,
        },
      }),
    })

    if (saveRes.error) {
      return { success: false, error: saveRes.error }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('wuzz_push_enabled', 'true')
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Push] Error subscribing to push:', err)
    return { success: false, error: err.message || 'Gagal mengaktifkan notifikasi' }
  }
}

// Unsubscribe dari Push Notification
export async function unsubscribeFromPushNotifications(): Promise<{ success: boolean; error?: string }> {
  if (!isPushNotificationSupported()) return { success: true }

  try {
    const registration = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready)
    if (registration) {
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        try {
          await subscription.unsubscribe()
        } catch {}

        // Beri tahu backend untuk menghapus subscription dari database Supabase
        await apiRequest('/api/notifications/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        })
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('wuzz_push_enabled', 'false')
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Push] Error unsubscribing from push:', err)
    return { success: false, error: err.message || 'Gagal menonaktifkan notifikasi' }
  }
}

// Sinkronisasi otomatis saat user login / membuka aplikasi
export async function autoSyncPushSubscription(): Promise<void> {
  if (!isPushNotificationSupported() || typeof window === 'undefined') return

  const userPref = localStorage.getItem('wuzz_push_enabled')
  if (userPref === 'false') {
    // User sengaja menonaktifkan
    return
  }

  // Jika izin belum pernah diminta (default), minta izin ke user
  if (Notification.permission === 'default') {
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
    } catch {
      return
    }
  }

  // Jika izin granted, pastikan subscription aktif dan terdaftar di database Supabase
  if (Notification.permission === 'granted') {
    try {
      const registration = await registerServiceWorker()
      if (registration) {
        let subscription = await registration.pushManager.getSubscription()
        if (!subscription) {
          const vapidKey = await fetchVAPIDPublicKey()
          if (vapidKey) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey) as any,
            })
          }
        }

        if (subscription) {
          const subJSON = subscription.toJSON()
          if (subJSON.endpoint && subJSON.keys?.p256dh && subJSON.keys?.auth) {
            await apiRequest('/api/notifications/subscribe', {
              method: 'POST',
              body: JSON.stringify({
                platform: 'web',
                endpoint: subJSON.endpoint,
                keys: {
                  p256dh: subJSON.keys.p256dh,
                  auth: subJSON.keys.auth,
                },
              }),
            })
            localStorage.setItem('wuzz_push_enabled', 'true')
          }
        }
      }
    } catch (err) {
      console.warn('[Push] Auto-sync subscription skipped:', err)
    }
  }
}

// Mengambil versi Service Worker yang sedang aktif berjalan di browser
export async function getActiveServiceWorkerVersion(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg || !reg.active) return null

    return new Promise((resolve) => {
      const channel = new MessageChannel()
      const timer = setTimeout(() => resolve(null), 800)
      channel.port1.onmessage = (event) => {
        clearTimeout(timer)
        resolve(event.data?.version || null)
      }
      reg.active?.postMessage({ type: 'GET_SW_VERSION' }, [channel.port2])
    })
  } catch {
    return null
  }
}
