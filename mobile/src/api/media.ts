/**
 * WuzzChat Media API Endpoints
 * Conforms to docs/openapi.yaml and backend/internal/api/media_handler.go
 */

import { toByteArray } from 'base64-js';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { apiClient } from './client';
import { MediaUploadResponse, MediaAckResponse, SignedUploadTicketResponse } from './types';

function classifyMediaType(mimeType: string, filename: string): string {
  const lowerMIME = (mimeType || '').toLowerCase();
  const lowerExt = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';

  if (
    lowerMIME.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(lowerExt)
  ) {
    return 'image';
  }
  if (
    lowerMIME.startsWith('audio/') ||
    ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac'].includes(lowerExt)
  ) {
    return 'audio';
  }
  if (
    lowerMIME.startsWith('video/') ||
    ['.mp4', '.webm', '.mov', '.avi'].includes(lowerExt)
  ) {
    return 'video';
  }
  return 'document';
}

export const mediaApi = {
  /**
   * Uploads an image, audio, or document file langsung ke storage via signed URL (0 MB egress VPS).
   * TIDAK ADA fallback lewat VPS: gagal = galat, pemanggil menampilkan pesan dan pengguna dapat mencoba lagi.
   * Video memakai uploadVideo().
   */
  async uploadMedia(
    uri: string,
    fileName?: string,
    mimeType?: string,
    base64?: string,
    purpose?: 'feed'
  ): Promise<MediaUploadResponse> {
    const purposeQuery = purpose ? `?purpose=${purpose}` : '';
    const cleanFileName = fileName || `media_${Date.now()}`;
    const cleanMimeType = mimeType || 'application/octet-stream';

    let bytes: Uint8Array | null = null;

    if (base64) {
      bytes = toByteArray(base64);
    } else if (uri) {
      // 1. Coba baca via File class dari expo-file-system
      try {
        const file = new File(uri);
        const fileBytes = await file.bytes();
        if (fileBytes && fileBytes.length > 0) {
          bytes = fileBytes;
        }
      } catch (fileErr) {
        console.warn('[mediaApi] File.bytes() failed, trying legacy FileSystem:', fileErr);
      }

      // 2. Coba fallback via legacy FileSystem.readAsStringAsync base64
      if (!bytes) {
        try {
          const b64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
          });
          if (b64) {
            bytes = toByteArray(b64);
          }
        } catch (legacyErr) {
          console.warn('[mediaApi] FileSystem.readAsStringAsync failed:', legacyErr);
        }
      }
    }

    // Direct Signed Upload ke storage (R2/Supabase). Tidak ada fallback ke VPS.
    const fileSize = bytes ? bytes.length : 0;
    const ticket = await apiClient<SignedUploadTicketResponse>(`/api/media/signed-upload-url${purposeQuery}`, {
      method: 'POST',
      body: JSON.stringify({
        file_name: cleanFileName,
        file_size: fileSize,
        mime_type: cleanMimeType,
      }),
      timeoutMs: 15000,
    });

    if (!ticket?.signed_url || !ticket?.public_url) {
      throw new Error('Server tidak menerbitkan tiket unggah. Coba lagi sebentar lagi.');
    }

    let putBody: any = bytes;
    if (!putBody && uri) {
      const fileRes = await fetch(uri);
      if (fileRes.ok) {
        putBody = await fileRes.blob();
      }
    }
    if (!putBody) {
      throw new Error('Berkas tidak dapat dibaca dari perangkat.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const directRes = await fetch(ticket.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': cleanMimeType },
        body: putBody,
        signal: controller.signal,
      });
      if (!directRes.ok) {
        throw new Error(`Unggah ke penyimpanan gagal (status ${directRes.status}). Coba lagi.`);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Unggah terlalu lama. Periksa koneksi lalu coba lagi.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    return {
      url: ticket.public_url,
      file_name: cleanFileName,
      file_size: fileSize,
      media_type: classifyMediaType(cleanMimeType, cleanFileName),
      mime_type: cleanMimeType,
    };
  },

  /**
   * Mengunggah video + thumbnail langsung ke R2 dari berkas (tanpa memuat ke memori), dengan progres.
   * Tidak ada fallback ke VPS. Thumbnail tersimpan di URL turunan video (<kunci>.thumb.jpg).
   */
  async uploadVideo(params: {
    uri: string;
    fileName: string;
    fileSize: number;
    thumbUri: string;
    thumbSize: number;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  }): Promise<MediaUploadResponse> {
    const { uri, fileName, fileSize, thumbUri, thumbSize, onProgress, signal } = params;
    const mimeType = 'video/mp4';

    const ticket = await apiClient<SignedUploadTicketResponse>('/api/media/signed-upload-url?purpose=video', {
      method: 'POST',
      body: JSON.stringify({
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
        thumb_size: thumbSize,
      }),
      timeoutMs: 15000,
    });
    if (!ticket?.signed_url || !ticket?.public_url || !ticket?.thumb_signed_url) {
      throw new Error('Server belum mendukung unggah video. Perbarui aplikasi atau coba lagi nanti.');
    }

    // Thumbnail dulu (kecil): bila gagal, video besar tidak sempat terunggah sia-sia.
    const thumbRes = await FileSystem.uploadAsync(ticket.thumb_signed_url, thumbUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    if (thumbRes.status < 200 || thumbRes.status >= 300) {
      throw new Error(`Unggah pratinjau video gagal (status ${thumbRes.status}). Coba lagi.`);
    }

    const task = FileSystem.createUploadTask(
      ticket.signed_url,
      uri,
      {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': mimeType },
      },
      (p) => {
        if (p.totalBytesExpectedToSend > 0) {
          onProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend);
        }
      }
    );
    const onAbort = () => {
      task.cancelAsync().catch(() => {});
    };
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await task.uploadAsync();
      if (signal?.aborted || !res) {
        throw new Error('Unggah video dibatalkan.');
      }
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Unggah video gagal (status ${res.status}). Coba lagi.`);
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
    onProgress?.(1);

    return {
      url: ticket.public_url,
      file_name: fileName,
      file_size: fileSize,
      media_type: 'video',
      mime_type: mimeType,
    };
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
