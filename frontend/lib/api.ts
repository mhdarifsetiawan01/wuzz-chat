import {
  AppConfig,
  MediaUploadResponse,
  LinkPreview,
  MemoryDraftListItem,
  MemoryDraftDetail,
  ApprovedMemoryListItem,
  ApprovedMemoryDetail,
} from './types'

// API client helper untuk berkomunikasi dengan Go REST API
const API_BASE = typeof window !== 'undefined' ? '' : (process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'http://localhost:8080')

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: T; error?: string; status?: number }> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') : null

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    // Safeguard jaringan slow/medium: batas waktu 15 detik untuk REST normal
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const signal = options.signal || controller.signal

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal,
      })

      const result = await res.json().catch(() => ({}))

      if (!res.ok) {
        // Jika token expired / unauthorized (dan bukan kegagalan verifikasi password atau login/register)
        if (res.status === 401 && typeof window !== 'undefined') {
          const isCredentialValidationEndpoint =
            endpoint.startsWith('/api/auth/login') ||
            endpoint.startsWith('/api/auth/register') ||
            endpoint.startsWith('/api/auth/verify-password') ||
            endpoint.startsWith('/api/auth/change-password') ||
            endpoint.startsWith('/api/users/public-key/reset') ||
            endpoint.startsWith('/api/user/public-key/reset')

          if (!isCredentialValidationEndpoint) {
            localStorage.removeItem('wuzz_auth_token')
            localStorage.removeItem('wuzz_user_profile')
            localStorage.removeItem('wuzz_auth_user')
            if (window.location.pathname !== '/login') {
              window.location.href = '/login?expired=1'
            }
          }
        }
        return { error: result.error || `Request gagal dengan status ${res.status}`, status: res.status, data: result }
      }

      return { data: result, status: res.status }
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { error: 'Koneksi ke server timeout (server lambat/jaringan tidak stabil)', status: 408 }
    }
    return { error: err.message || 'Gagal terhubung ke server', status: 500 }
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

    // Safeguard upload media untuk jaringan slow/medium: batas waktu 60 detik
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const res = await fetch(`${API_BASE}/api/media/upload`, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      })

      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { error: result.error || `Upload gagal dengan status ${res.status}` }
      }
      return { data: result }
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { error: 'Upload timeout: server lambat atau ukuran berkas terlalu besar untuk kecepatan jaringan saat ini' }
    }
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

export async function deleteMessageApi(
  messageId: string,
  deleteType: 'for_me' | 'for_everyone'
): Promise<{ data?: { status: string }; error?: string }> {
  const isForEveryone = deleteType === 'for_everyone'
  return apiRequest<{ status: string }>('/api/messages/delete', {
    method: 'POST',
    body: JSON.stringify({
      message_id: messageId,
      delete_for_everyone: isForEveryone,
      type: deleteType,
    }),
  })
}

// =============================================================================
// Group Memory AI Client Helpers (Milestone 10)
// =============================================================================

export async function fetchMemoryDrafts(groupId: string): Promise<{ data?: MemoryDraftListItem[]; error?: string }> {
  return apiRequest<MemoryDraftListItem[]>(`/api/memory/drafts?group_id=${encodeURIComponent(groupId)}`)
}

export async function fetchMemoryDraftDetail(draftId: string): Promise<{ data?: { draft: MemoryDraftDetail }; error?: string }> {
  return apiRequest<{ draft: MemoryDraftDetail }>(`/api/memory/drafts/${encodeURIComponent(draftId)}`)
}

export async function approveMemoryDraft(draftId: string, withChanges?: boolean): Promise<{ data?: any; error?: string }> {
  const action = withChanges ? 'approve-with-changes' : 'approve'
  return apiRequest<any>(`/api/memory/drafts/${encodeURIComponent(draftId)}/${action}`, {
    method: 'POST',
  })
}

export async function rejectMemoryDraft(draftId: string, reason?: string): Promise<{ data?: any; error?: string }> {
  return apiRequest<any>(`/api/memory/drafts/${encodeURIComponent(draftId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || '' }),
  })
}

export async function updateMemoryArtifact(draftId: string, artifactId: string, content: string): Promise<{ data?: any; error?: string }> {
  return apiRequest<any>(`/api/memory/drafts/${encodeURIComponent(draftId)}/artifacts/${encodeURIComponent(artifactId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  })
}

export async function removeJourneyLite(draftId: string): Promise<{ data?: any; error?: string }> {
  return apiRequest<any>(`/api/memory/drafts/${encodeURIComponent(draftId)}/journey`, {
    method: 'DELETE',
  })
}

export async function fetchGroupMemories(groupId: string, limit = 20, offset = 0): Promise<{ data?: ApprovedMemoryListItem[]; error?: string }> {
  return apiRequest<ApprovedMemoryListItem[]>(`/api/groups/${encodeURIComponent(groupId)}/memories?limit=${limit}&offset=${offset}`)
}

export async function fetchApprovedMemoryDetail(memoryId: string): Promise<{ data?: ApprovedMemoryDetail; error?: string }> {
  return apiRequest<ApprovedMemoryDetail>(`/api/memories/${encodeURIComponent(memoryId)}`)
}




