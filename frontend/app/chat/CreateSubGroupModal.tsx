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
  const [isPublic, setIsPublic] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setDuration('7_days')
      setIsPublic(true)
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
      setErrorMessage('Nama topik forum wajib diisi')
      return
    }
    if (trimmedTitle.length < 2) {
      setErrorMessage('Nama topik forum minimal 2 karakter')
      return
    }
    if (trimmedTitle.length > 128) {
      setErrorMessage('Nama topik forum maksimal 128 karakter')
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
            is_public: isPublic,
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
        throw new Error('Gagal menerima data topik forum dari server')
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errObj = err as { name?: string; message?: string }
      if (errObj?.name === 'AbortError') {
        setErrorMessage('Koneksi timeout (15 detik). Server mungkin lambat merespons, silakan coba lagi.')
      } else {
        setErrorMessage(errObj?.message || 'Gagal membuat topik forum. Pastikan Anda anggota grup utama.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="group-modal-backdrop z-modal" onClick={() => !isLoading && onClose()}>
      <div 
        className="group-modal-card" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, maxHeight: '90vh', padding: 0 }}
      >
        {/* Header Modal */}
        <div className="group-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(129,140,248,0.25))',
              border: '1px solid rgba(59,130,246,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              boxShadow: '0 2px 10px rgba(59,130,246,0.2)'
            }}>
              🏛️
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Buat Topik Forum Baru
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Ruang diskusi di dalam <strong style={{ color: 'var(--text-primary)' }}>{parentGroupName}</strong>
              </span>
            </div>
          </div>
          <button 
            className="group-modal-close-btn" 
            onClick={onClose} 
            disabled={isLoading}
            aria-label="Tutup modal"
          >
            ✕
          </button>
        </div>

        {/* Body Modal */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="group-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {errorMessage && (
              <div 
                style={{ 
                  background: 'var(--tint-error-15)', 
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: 'var(--color-error)',
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
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Nama Topik Forum <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <input
                type="text"
                className="group-form-input"
                placeholder="Contoh: Diskusi Desain UI, Sprint Review"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={128}
                disabled={isLoading}
                autoFocus
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                Maksimal 128 karakter
              </span>
            </div>

            {/* Input Deskripsi */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Deskripsi Singkat (Opsional)
              </label>
              <textarea
                className="group-form-textarea"
                placeholder="Jelaskan tujuan atau fokus pembicaraan topik ini..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                disabled={isLoading}
                rows={2}
                style={{ resize: 'none' }}
              />
            </div>

            {/* Pilihan Masa Aktif (TTL) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                ⏳ Masa Aktif Forum (Masa Kedaluwarsa)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Opsi 1: 1 Minggu (Default) */}
                <div
                  onClick={() => !isLoading && setDuration('7_days')}
                  style={{
                    border: duration === '7_days' ? '2px solid var(--accent-500)' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: duration === '7_days' ? 'var(--tint-accent-12)' : 'rgba(255, 255, 255, 0.03)',
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
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: duration === '7_days' ? 'var(--accent-400)' : 'inherit' }}>
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
                    border: duration === '30_days' ? '2px solid var(--accent-500)' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: duration === '30_days' ? 'var(--tint-accent-12)' : 'rgba(255, 255, 255, 0.03)',
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
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: duration === '30_days' ? 'var(--accent-400)' : 'inherit' }}>
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

            {/* Pilihan Hak Akses Subgrup */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                🛡️ Hak Akses Bergabung
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Opsi Terbuka (Public) */}
                <div
                  onClick={() => !isLoading && setIsPublic(true)}
                  style={{
                    border: isPublic ? '2px solid var(--color-success)' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: isPublic ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
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
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isPublic ? 'var(--color-online)' : 'inherit' }}>
                      🌐 Terbuka
                    </span>
                    <input 
                      type="radio" 
                      name="isPublic" 
                      checked={isPublic} 
                      onChange={() => setIsPublic(true)}
                      disabled={isLoading}
                    />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    Semua anggota grup utama dapat langsung bergabung & membuka topik.
                  </span>
                </div>

                {/* Opsi Privat (Private) */}
                <div
                  onClick={() => !isLoading && setIsPublic(false)}
                  style={{
                    border: !isPublic ? '2px solid var(--color-warning)' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: !isPublic ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.03)',
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
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: !isPublic ? 'var(--color-warning)' : 'inherit' }}>
                      🔒 Privat
                    </span>
                    <input 
                      type="radio" 
                      name="isPublic" 
                      checked={!isPublic} 
                      onChange={() => setIsPublic(false)}
                      disabled={isLoading}
                    />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    Hanya yang diundang atau yang permohonan izinnya disetujui admin/creator.
                  </span>
                </div>
              </div>
            </div>

            {/* Catatan Masa Depan / AI Summary Notice */}
            <div 
              style={{
                background: 'var(--tint-accent-08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '0.75rem',
                color: 'var(--accent-300)',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <span>🤖</span>
              <span>
                <strong>Info Otomatis:</strong> Setelah masa aktif habis, topik forum akan terkunci dan siap dirangkum oleh modul AI Summary di masa depan.
              </span>
            </div>
          </div>

          {/* Footer Modal */}
          <div className="group-modal-footer">
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
                'Buat Topik Forum'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
