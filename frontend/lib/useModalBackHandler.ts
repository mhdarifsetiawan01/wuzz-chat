import { useEffect, useRef, useCallback } from 'react'

/**
 * useModalBackHandler
 * Menangani navigasi tombol Back fisik/gesture pada browser mobile (Android/iOS).
 * Ketika modal dibuka di handphone:
 * 1. Menambahkan state sementara ke `window.history`
 * 2. Mencegat event `popstate` saat tombol Back ditekan sehingga hanya menutup modal
 * 3. Mencegah aplikasi keluar dari room obrolan / kembali ke halaman daftar obrolan
 */
export function useModalBackHandler(
  isOpen: boolean,
  onClose: () => void,
  modalId: string = 'modal'
) {
  const isPushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return

    const stateKey = `modal_${modalId}_${Date.now()}`
    window.history.pushState({ modal: stateKey }, '')
    isPushedRef.current = true

    const handlePopState = () => {
      // Tombol back HP ditekan
      isPushedRef.current = false
      onCloseRef.current()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('keydown', handleKeyDown)
      // Jika modal ditutup lewat React state/unmount tanpa event popstate, bersihkan dummy history
      if (isPushedRef.current) {
        isPushedRef.current = false
        window.history.back()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, modalId])

  const handleClose = useCallback(() => {
    if (isPushedRef.current && typeof window !== 'undefined') {
      isPushedRef.current = false
      window.history.back()
    }
    onCloseRef.current()
  }, [])

  return handleClose
}
