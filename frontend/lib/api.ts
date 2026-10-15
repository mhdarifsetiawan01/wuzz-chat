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
            endpoint.startsWith('/api/auth/refresh') ||
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

function classifyMediaType(mimeType: string, filename: string): 'image' | 'audio' | 'video' | 'document' {
  const lowerMIME = (mimeType || '').toLowerCase()
  const lowerExt = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : ''

  if (
    lowerMIME.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(lowerExt)
  ) {
    return 'image'
  }
  if (
    lowerMIME.startsWith('audio/') ||
    ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac'].includes(lowerExt)
  ) {
    return 'audio'
  }
  if (
    lowerMIME.startsWith('video/') ||
    ['.mp4', '.webm', '.mov', '.avi'].includes(lowerExt)
  ) {
    return 'video'
  }
  return 'document'
}

interface UploadTicket {
  signed_url?: string
  public_url?: string
  thumb_signed_url?: string
  thumb_public_url?: string
}

// Tiket unggah langsung ke storage (R2/Supabase). TIDAK ADA fallback upload lewat VPS: gagal = galat + coba lagi.
async function fetchUploadTicket(
  payload: { file_name: string; file_size: number; mime_type: string; thumb_size?: number },
  purpose?: 'video'
): Promise<{ ticket?: UploadTicket; error?: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') : null
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${API_BASE}/api/media/signed-upload-url${purpose ? `?purpose=${purpose}` : ''}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { error: body.error || `Gagal menyiapkan unggahan (status ${res.status}). Coba lagi.` }
    }
    if (!body.signed_url || !body.public_url) {
      return { error: 'Server tidak menerbitkan tiket unggah. Coba lagi sebentar lagi.' }
    }
    return { ticket: body as UploadTicket }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { error: 'Koneksi ke server timeout. Periksa jaringan lalu coba lagi.' }
    }
    return { error: err?.message || 'Gagal terhubung ke server' }
  } finally {
    clearTimeout(timeoutId)
  }
}

function videoMimeFor(file: File): string {
  if (file.type.toLowerCase().startsWith('video/')) return file.type
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : ''
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.webm') return 'video/webm'
  return 'video/mp4'
}

// PUT dengan progres (fetch belum punya progres unggah). Content-Length ikut ditandatangani server, XHR mengisinya otomatis.
function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
  timeoutMs = 300000
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.timeout = timeoutMs
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status })
    xhr.onerror = () => reject(new Error('Koneksi terputus saat mengunggah. Coba lagi.'))
    xhr.ontimeout = () => reject(new Error('Unggah terlalu lama. Periksa jaringan lalu coba lagi.'))
    xhr.send(body)
  })
}

export async function uploadMedia(file: File): Promise<{ data?: MediaUploadResponse; error?: string }> {
  const mimeType = file.type || 'application/octet-stream'
  const { ticket, error } = await fetchUploadTicket({ file_name: file.name, file_size: file.size, mime_type: mimeType })
  if (!ticket) return { error }

  // Safeguard jaringan lambat: batas waktu 60 detik
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)
  try {
    const res = await fetch(ticket.signed_url!, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
      signal: controller.signal,
    })
    if (!res.ok) {
      return { error: `Unggah ke penyimpanan gagal (status ${res.status}). Coba lagi.` }
    }
    return {
      data: {
        url: ticket.public_url!,
        file_name: file.name,
        file_size: file.size,
        media_type: classifyMediaType(mimeType, file.name),
        mime_type: mimeType,
      },
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { error: 'Upload timeout: server lambat atau ukuran berkas terlalu besar untuk kecepatan jaringan saat ini' }
    }
    return { error: err?.message || 'Gagal mengunggah file ke penyimpanan' }
  } finally {
    clearTimeout(timeoutId)
  }
}

// Unggah video + thumbnail langsung ke R2 (tanpa fallback VPS). Thumbnail tersimpan di URL turunan video (<kunci>.thumb.jpg).
export async function uploadVideo(
  file: File,
  thumb: Blob,
  onProgress?: (fraction: number) => void
): Promise<{ data?: MediaUploadResponse; error?: string }> {
  const mimeType = videoMimeFor(file)
  const { ticket, error } = await fetchUploadTicket(
    { file_name: file.name, file_size: file.size, mime_type: mimeType, thumb_size: thumb.size },
    'video'
  )
  if (!ticket) return { error }
  if (!ticket.thumb_signed_url) {
    return { error: 'Server belum mendukung unggah video. Muat ulang aplikasi atau coba lagi nanti.' }
  }

  try {
    // Thumbnail dulu (kecil): bila gagal, video besar tidak sempat terunggah sia-sia.
    const thumbRes = await putWithProgress(ticket.thumb_signed_url, thumb, 'image/jpeg', undefined, 60000)
    if (!thumbRes.ok) return { error: `Unggah pratinjau video gagal (status ${thumbRes.status}). Coba lagi.` }

    const videoRes = await putWithProgress(ticket.signed_url!, file, mimeType, onProgress)
    if (!videoRes.ok) return { error: `Unggah video gagal (status ${videoRes.status}). Coba lagi.` }
  } catch (err: any) {
    return { error: err?.message || 'Gagal mengunggah video' }
  }
  onProgress?.(1)

  return {
    data: {
      url: ticket.public_url!,
      file_name: file.name,
      file_size: file.size,
      media_type: 'video',
      mime_type: mimeType,
    },
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




