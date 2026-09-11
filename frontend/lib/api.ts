// API client helper untuk berkomunikasi dengan Go REST API

const API_BASE = typeof window !== 'undefined' ? '' : 'http://localhost:8080'

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
      return { error: result.error || `Request gagal dengan status ${res.status}` }
    }

    return { data: result }
  } catch (err: any) {
    return { error: err.message || 'Gagal terhubung ke server' }
  }
}
