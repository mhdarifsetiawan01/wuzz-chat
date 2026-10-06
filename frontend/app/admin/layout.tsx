import type { Metadata } from 'next'
import './admin.css'
import AdminShell from './AdminShell'

// Alat internal: jangan diindeks mesin pencari.
export const metadata: Metadata = {
  title: 'Moderasi — Wuzz Chat',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
