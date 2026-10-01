import type { Metadata } from 'next'
import ShareContent from './ShareContent'

export const metadata: Metadata = {
  title: 'Pindahkan Kunci Chat — Wuzz Chat',
  robots: { index: false, follow: false },
}

export default function TransferSharePage() {
  return <ShareContent />
}
