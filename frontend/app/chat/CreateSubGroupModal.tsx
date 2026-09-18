'use client'

import React, { useState, useEffect } from 'react'
import { GroupDetails } from '@/lib/types'
import { apiRequest } from '@/lib/api'

interface CreateSubGroupModalProps {
  isOpen: boolean
  onClose: () => void
  parentGroupId: string
  parentGroupName: string
  onSubGroupCreated: (subGroup: GroupDetails) => void
}

export default function CreateSubGroupModal({
  isOpen,
  onClose,
  parentGroupId,
  parentGroupName,
  onSubGroupCreated,
}: CreateSubGroupModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState<'7_days' | '30_days'>('7_days')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setDuration('7_days')
      setIsLoading(false)
      setErrorMessage('')
    }
  }, [isOpen])

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isLoading, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setErrorMessage('Nama subgrup wajib diisi')
      return
    }
    if (trimmedTitle.length < 2) {
      setErrorMessage('Nama subgrup minimal 2 karakter')
      return
    }
    if (trimmedTitle.length > 128) {
      setErrorMessage('Nama subgrup maksimal 128 karakter')
      return
    }

    setIsLoading(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const { data, error } = await apiRequest<{ success: boolean; subgroup: GroupDetails }>(
        `/api/groups/${encodeURIComponent(parentGroupId)}/subgroups`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: trimmedTitle,
            description: description.trim(),
            duration: duration,
          }),
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      if (error) {
        throw new Error(error)
      }

      if (data && data.subgroup) {
        onSubGroupCreated(data.subgroup)
        onClose()
      } else {
        throw new Error('Gagal menerima data subgrup dari server')
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errObj = err as { name?: string; message?: string }
      if (errObj?.name === 'AbortError') {
        setErrorMessage('Koneksi timeout (15 detik). Server mungkin lambat merespons, silakan coba lagi.')
      } else {
        setErrorMessage(errObj?.message || 'Gagal membuat subgrup. Pastikan Anda anggota grup utama.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !isLoading && onClose()}>
      <div 
        className="modal-content create-group-modal" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        {/* Header Modal */}
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💬</span> Buat Subgrup Baru
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Topik diskusi bertopik di dalam <strong style={{ color: 'var(--text-primary)' }}>{parentGroupName}</strong>
            </p>
          </div>
          <button 
            className="modal-close-btn" 
            onClick={onClose} 
            disabled={isLoading}
            aria-label="Tutup modal"
          >
            ✕
          </button>
        </div>

        {/* Body Modal */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {errorMessage && (
              <div 
                style={{ 
                  background: 'rgba(239, 68, 68, 0.15)', 
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '0.85rem'
                }}
              >
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Input Nama Topik */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Nama Subgrup / Topik <span style={{ color: 'var(--danger-color, #ef4444)' }}>*</span>
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Contoh: Diskusi Desain UI, Sprint Review Minggu 3"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={128}
                disabled={isLoading}
                autoFocus
                required
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                Maksimal 128 karakter
              </span>
            </div>

            {/* Input Deskripsi */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Deskripsi Singkat (Opsional)
              </label>
              <textarea
                className="input-field"
                placeholder="Jelaskan tujuan atau fokus pembicaraan topik ini..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                disabled={isLoading}
                rows={2}
                style={{ width: '100%', resize: 'none' }}
              />
            </div>

            {/* Pilihan Masa Aktif (TTL) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
                ⏳ Masa Aktif Subgrup (Masa Kedaluwarsa)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Opsi 1: 1 Minggu (Default) */}
                <div
                  onClick={() => !isLoading && setDuration('7_days')}
                  style={{
                    border: duration === '7_days' ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: duration === '7_days' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '12px',
                    padding: '12px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: duration === '7_days' ? '#60a5fa' : 'inherit' }}>
                      🌟 1 Minggu
                    </span>
                    <input 
                      type="radio" 
                      name="duration" 
                      checked={duration === '7_days'} 
                      onChange={() => setDuration('7_days')}
                      disabled={isLoading}
                    />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    Ideal untuk koordinasi sprint & acara singkat. (Default)
                  </span>
                </div>

                {/* Opsi 2: 1 Bulan */}
                <div
                  onClick={() => !isLoading && setDuration('30_days')}
                  style={{
                    border: duration === '30_days' ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: duration === '30_days' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '12px',
                    padding: '12px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: duration === '30_days' ? '#60a5fa' : 'inherit' }}>
                      🗓️ 1 Bulan
                    </span>
                    <input 
                      type="radio" 
                      name="duration" 
                      checked={duration === '30_days'} 
                      onChange={() => setDuration('30_days')}
                      disabled={isLoading}
                    />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    Cocok untuk proyek bulanan atau diskusi berkala.
                  </span>
                </div>
              </div>
            </div>

            {/* Catatan Masa Depan / AI Summary Notice */}
            <div 
              style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '0.75rem',
                color: '#93c5fd',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <span>🤖</span>
              <span>
                <strong>Info Otomatis:</strong> Setelah masa aktif habis, subgrup akan terkunci dan siap dirangkum oleh modul AI Summary di masa depan.
              </span>
            </div>
          </div>

          {/* Footer Modal */}
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isLoading}
              style={{ borderRadius: '10px', padding: '10px 18px' }}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !title.trim()}
              style={{ 
                borderRadius: '10px', 
                padding: '10px 22px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                fontWeight: 600
              }}
            >
              {isLoading ? (
                <>
                  <span className="spinner-small" /> Memproses...
                </>
              ) : (
                'Buat Subgrup'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
