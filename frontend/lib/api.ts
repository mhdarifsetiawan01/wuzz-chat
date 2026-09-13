import { AppConfig, MediaUploadResponse, LinkPreview } from './types'

// API client helper untuk berkomunikasi dengan Go REST API
const API_BASE = typeof window !== 'undefined' ? '' : (process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'http://localhost:8080')

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: string }> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') : null

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    })

    const result = await res.json().catch(() => ({}))

    if (!res.ok) {
      // Jika token expired / unauthorized dan bukan request login/register
      if (res.status === 401 && typeof window !== 'undefined' && !endpoint.startsWith('/api/auth/login') && !endpoint.startsWith('/api/auth/register')) {
        localStorage.removeItem('wuzz_auth_token')
        localStorage.removeItem('wuzz_user_profile')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login?expired=1'
        }
      }
      return { error: result.error || `Request gagal dengan status ${res.status}` }
    }

    return { data: result }
  } catch (err: any) {
    return { error: err.message || 'Gagal terhubung ke server' }
  }
}

export async function uploadMedia(file: File): Promise<{ data?: MediaUploadResponse; error?: string }> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') : null
    const formData = new FormData()
    formData.append('file', file)

    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API_BASE}/api/media/upload`, {
      method: 'POST',
      headers,
      body: formData,
    })

    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { error: result.error || `Upload gagal dengan status ${res.status}` }
    }
    return { data: result }
  } catch (err: any) {
    return { error: err.message || 'Gagal mengunggah file ke server' }
  }
}

export async function getAppConfig(): Promise<AppConfig | null> {
  const res = await apiRequest<AppConfig>('/api/config')
  return res.data || null
}

export async function acknowledgeMediaDownload(
  messageId: string,
  roomId?: string
): Promise<{ data?: { status: string; media_status: string }; error?: string }> {
  if (!messageId) return { error: 'messageId required' }
  return apiRequest<{ status: string; media_status: string }>('/api/media/ack', {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId, room_id: roomId }),
  })
}

// In-memory frontend cache untuk link preview agar tidak redundant fetch
const previewCache = new Map<string, LinkPreview>()

export async function fetchLinkPreview(targetUrl: string): Promise<LinkPreview | null> {
  if (!targetUrl) return null
  if (previewCache.has(targetUrl)) {
    return previewCache.get(targetUrl)!
  }

  const res = await apiRequest<LinkPreview>(`/api/link-preview?url=${encodeURIComponent(targetUrl)}`)
  if (res.data && res.data.title) {
    previewCache.set(targetUrl, res.data)
    return res.data
  }
  return null
}


