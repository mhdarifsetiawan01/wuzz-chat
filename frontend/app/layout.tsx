import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Wuzz Chat — Real-time WebSocket Chat',
  description: 'Chat 1-on-1 secara real-time menggunakan WebSocket. Proyek belajar Go + Next.js.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
