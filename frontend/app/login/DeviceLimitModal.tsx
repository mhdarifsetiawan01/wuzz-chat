'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useModalBackHandler } from '@/lib/useModalBackHandler'

export interface ActiveDeviceItem {
  id: string
  name: string
  platform: string
  user_agent?: string
  last_seen_at?: string
  created_at?: string
}

interface DeviceLimitModalProps {
  isOpen: boolean
  activeDevices: ActiveDeviceItem[]
  onClose: () => void
  onConfirm: (kickDeviceId: string) => void
  isSubmitting?: boolean
  errorMessage?: string
}

function parseUserAgent(ua?: string, fallbackName?: string) {
  let browser = 'Browser'
  let os = 'Perangkat'
  let icon = '💻'

  if (!ua) {
    return { name: fallbackName || 'Perangkat Terdaftar', icon: '💻' }
  }

  if (/android/i.test(ua)) {
    os = 'Android'
    icon = '📱'
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS'
    icon = '📱'
  } else if (/windows/i.test(ua)) {
    os = 'Windows'
    icon = '🖥️'
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS'
    icon = '💻'
  } else if (/linux/i.test(ua)) {
    os = 'Linux'
    icon = '🐧'
  }

  if (/chrome|crios/i.test(ua) && !/edg|opr/i.test(ua)) {
    browser = 'Chrome'
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Safari'
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox'
  } else if (/edg/i.test(ua)) {
    browser = 'Edge'
  }

  return { name: `${browser} di ${os}`, icon }
}

function formatRelativeTime(isoDate?: string) {
  if (!isoDate) return 'Waktu tidak diketahui'
  try {
    const date = new Date(isoDate)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Baru saja aktif'
    if (diffMin < 60) return `Aktif ${diffMin} mnt lalu`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `Aktif ${diffHour} jam lalu`
    const diffDay = Math.floor(diffHour / 24)
    if (diffDay < 7) return `Aktif ${diffDay} hari lalu`
    return `Aktif ${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`
  } catch {
    return 'Waktu tidak diketahui'
  }
}

export function DeviceLimitModal({
  isOpen,
  activeDevices,
  onClose,
  onConfirm,
  isSubmitting = false,
  errorMessage = '',
}: DeviceLimitModalProps) {
  // Default pilih perangkat terakhir (perangkat terlama / FIFO)
  const defaultSelectedId = activeDevices.length > 0 ? activeDevices[activeDevices.length - 1].id : ''
  const [selectedId, setSelectedId] = useState(defaultSelectedId)

  useEffect(() => {
    if (activeDevices.length > 0 && !selectedId) {
      setSelectedId(activeDevices[activeDevices.length - 1].id)
    }
  }, [activeDevices, selectedId])

  useModalBackHandler(isOpen, onClose, 'device_limit')

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="modal-overlay"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-limit-title"
    >
      <div
        className="modal-card-unified"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        {/* Header */}
        <div className="modal-header-unified">
          <div className="u-flex u-items-center u-gap-2">
            <span style={{ fontSize: '1.4rem' }}>⚠️</span>
            <h3 id="device-limit-title" className="modal-title-unified">
              Batas Perangkat Tercapai
            </h3>
          </div>
          {!isSubmitting && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Tutup modal"
            >
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div className="modal-body-unified">
          <p className="u-text-sm u-text-secondary" style={{ marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
            Akun Anda saat ini sudah aktif di <strong>2 perangkat</strong> (batas maksimal). Demi keamanan obrolan, silakan pilih salah satu perangkat lama yang ingin dikeluarkan untuk melanjutkan login di perangkat ini.
          </p>

          {errorMessage && (
            <div
              className="u-text-xs u-text-error"
              style={{
                background: 'var(--tint-error-10)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-3)',
              }}
            >
              ⚠️ {errorMessage}
            </div>
          )}

          <div className="u-flex u-flex-col u-gap-2" style={{ marginBottom: 'var(--space-4)' }}>
            {activeDevices.map((dev, idx) => {
              const isSelected = dev.id === selectedId
              const isOldest = idx === activeDevices.length - 1
              const info = parseUserAgent(dev.user_agent, dev.name)
              const timeStr = formatRelativeTime(dev.last_seen_at || dev.created_at)

              return (
                <div
                  key={dev.id}
                  onClick={() => !isSubmitting && setSelectedId(dev.id)}
                  className="u-cursor-pointer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected
                      ? '1px solid var(--border-accent, #3b82f6)'
                      : '1px solid var(--border-default)',
                    background: isSelected
                      ? 'var(--tint-accent-10)'
                      : 'var(--bg-secondary)',
                    transition: 'var(--transition-fast)',
                  }}
                >
                  <div className="u-flex u-items-center u-gap-3 u-min-w-0">
                    <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{info.icon}</span>
                    <div className="u-min-w-0">
                      <div className="u-flex u-items-center u-gap-2">
                        <span
                          className="u-text-sm u-fw-600 u-truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {dev.name || info.name}
                        </span>
                        {isOldest && (
                          <span
                            className="u-text-xs"
                            style={{
                              fontSize: '0.65rem',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              background: 'var(--tint-warning-10, rgba(234, 179, 8, 0.15))',
                              color: 'var(--color-warning, #eab308)',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            Paling Lama
                          </span>
                        )}
                      </div>
                      <div className="u-text-xs u-text-muted" style={{ marginTop: '2px' }}>
                        {timeStr}
                      </div>
                    </div>
                  </div>

                  <input
                    type="radio"
                    name="selected_kick_device"
                    checked={isSelected}
                    onChange={() => setSelectedId(dev.id)}
                    disabled={isSubmitting}
                    style={{ accentColor: 'var(--color-accent, #3b82f6)', marginLeft: '8px' }}
                  />
                </div>
              )
            })}
          </div>

          <div
            className="u-text-xs u-text-muted"
            style={{
              background: 'var(--bg-secondary)',
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              lineHeight: 1.4,
            }}
          >
            ℹ️ Perangkat yang Anda pilih akan otomatis keluar (*logout*), dan sesi obrolan di perangkat tersebut akan ditutup.
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer-unified">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(selectedId)}
            disabled={isSubmitting || !selectedId}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isSubmitting ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                Memproses...
              </>
            ) : (
              'Keluarkan & Lanjutkan Masuk'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
