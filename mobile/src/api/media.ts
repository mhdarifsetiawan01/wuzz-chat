/**
 * WuzzChat Media API Endpoints
 * Conforms to docs/openapi.yaml and backend/internal/api/media_handler.go
 */

import { toByteArray } from 'base64-js';
import { apiClient } from './client';
import { MediaUploadResponse, MediaAckResponse } from './types';

export const mediaApi = {
  /**
   * POST /api/media/upload
   * Uploads an image, video, audio, or document file via multipart/form-data.
   * Adheres to Slow & Flaky Server Resilience Rule (60-second timeout guard).
   */
  async uploadMedia(
    uri: string,
    fileName?: string,
    mimeType?: string,
    base64?: string
  ): Promise<MediaUploadResponse> {
    const cleanFileName = fileName || `image_${Date.now()}.jpg`;
    const cleanMimeType = mimeType || 'image/jpeg';

    const formData = new FormData();

    if (base64) {
      // Prioritaskan konversi langsung dari binary base64 yang dihasilkan oleh ImagePicker.
      // Menggunakan objek part dengan method bytes() yang didukung penuh oleh Expo WinterCG fetch (convertFormDataAsync).
      // Pendekatan ini menyelesaikan 3 masalah sekaligus:
      // 1. Bug React Native Blob: "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"
      // 2. Bug React Native File: "Cannot assign to property 'name' which has only a getter"
      // 3. Bug Android Scoped Storage: fetch(local_uri) mengembalikan 404 "File not found"
      const bytes = toByteArray(base64);
      const filePart = {
        name: cleanFileName,
        type: cleanMimeType,
        size: bytes.length,
        bytes: async () => bytes,
      };
      formData.append('file', filePart as any);
    } else {
      const fileRes = await fetch(uri);
      if (!fileRes.ok) {
        throw new Error(`Gagal membaca file lokal (${fileRes.status} ${fileRes.statusText})`);
      }
      const blob = await fileRes.blob();

      try {
        Object.defineProperty(blob, 'name', {
          value: cleanFileName,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        // Abaikan jika tidak diizinkan
      }

      try {
        Object.defineProperty(blob, 'type', {
          value: cleanMimeType,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        // Abaikan jika tidak diizinkan
      }

      formData.append('file', blob, cleanFileName);
    }

    return apiClient<MediaUploadResponse>('/api/media/upload', {
      method: 'POST',
      body: formData,
      timeoutMs: 60000, // 60s timeout for media uploads
    });
  },

  /**
   * POST /api/media/ack
   * Acknowledges media download/display by recipient (WhatsApp Store-and-Forward Lifecycle).
   */
  async acknowledgeMediaDownload(
    messageId: string,
    roomId?: string
  ): Promise<MediaAckResponse> {
    if (!messageId) {
      throw new Error('messageId is required for media ACK');
    }

    return apiClient<MediaAckResponse>('/api/media/ack', {
      method: 'POST',
      body: JSON.stringify({
        message_id: messageId,
        room_id: roomId,
      }),
      timeoutMs: 15000,
    });
  },
};
