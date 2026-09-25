/**
 * WuzzChat REST API Client
 * Wraps fetch with AbortController 15-second timeout and canonical headers.
 * Strictly adheres to Mandatory Slow & Flaky Server Resilience Rule.
 */

import { secureStorage } from '../services/secureStorage';
import { API_CONFIG, getBaseApiUrl } from './config';
import { ApiError } from './types';

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  skipAuth?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeoutMs = API_CONFIG.TIMEOUT_MS, skipAuth = false, headers = {}, ...restOptions } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const baseUrl = getBaseApiUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}${cleanEndpoint}`;

  const requestHeaders: Record<string, string> = {
    'Accept': 'application/json',
    'X-Device-Platform': API_CONFIG.PLATFORM,
    'X-Tenant-ID': API_CONFIG.TENANT_ID,
    ...(headers as Record<string, string>),
  };

  // Set Content-Type: application/json by default unless body is FormData (to allow boundary creation)
  const isFormData =
    (typeof FormData !== 'undefined' && restOptions.body instanceof FormData) ||
    (Boolean(restOptions.body) && typeof (restOptions.body as any).append === 'function');

  if (!requestHeaders['Content-Type'] && !isFormData) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = await secureStorage.getAuthToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(fullUrl, {
      ...restOptions,
      headers: requestHeaders,
      signal: controller.signal,
    });

    clearTimeout(timer);

    // Parse JSON safely
    const responseText = await response.text();
    let data: any = null;
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }
    }

    if (!response.ok) {
      const error: ApiError = {
        status: response.status,
        title: data?.title || data?.error || 'Request Error',
        detail: data?.detail || data?.message || `Server merespons dengan status ${response.status}`,
        code: data?.code,
      };
      throw error;
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      const timeoutError: ApiError = {
        status: 408,
        title: 'Request Timeout',
        detail: `Koneksi ke server terputus karena batas waktu (${timeoutMs / 1000} detik) terlampaui. Periksa jaringan Anda.`,
      };
      throw timeoutError;
    }

    if (err.status && err.detail) {
      throw err;
    }

    const networkError: ApiError = {
      status: 0,
      title: 'Koneksi Gagal',
      detail: err.message || 'Tidak dapat terhubung ke server WuzzChat.',
    };
    throw networkError;
  }
}
