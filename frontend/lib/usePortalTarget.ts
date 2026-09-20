'use client'

import { useState, useEffect } from 'react'

/**
 * Hook yang mengembalikan elemen DOM target untuk createPortal.
 * Menggunakan #modal-portal-root yang didefinisikan di layout.tsx,
 * yang berada di LUAR stacking context .chat-app-container.
 *
 * Dengan pola ini, modal dengan position:fixed + inset:0 akan selalu
 * relatif terhadap viewport, tidak terpotong oleh overflow:hidden atau
 * stacking context parent manapun.
 */
export function usePortalTarget(): Element | null {
  const [target, setTarget] = useState<Element | null>(null)

  useEffect(() => {
    // Coba gunakan #modal-portal-root dari layout.tsx
    const root = document.getElementById('modal-portal-root')
    setTarget(root ?? document.body)
  }, [])

  return target
}
