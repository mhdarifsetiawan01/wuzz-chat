import Link from 'next/link'
import { LEGAL_EFFECTIVE_DATE } from '@/lib/legal'

// Kerangka halaman dokumen legal (server component, tanpa sesi/API) yang bisa dibuka tanpa login.
export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <div className="legal-header">
          <Link href="/" className="legal-brand">Wuzz Chat</Link>
          <h1>{title}</h1>
          <p className="legal-meta">Berlaku sejak {LEGAL_EFFECTIVE_DATE}</p>
        </div>
        <div className="legal-body">{children}</div>
        <nav className="legal-footer" aria-label="Dokumen legal">
          <Link href="/privacy">Kebijakan Privasi</Link>
          <Link href="/terms">Syarat Layanan</Link>
          <Link href="/child-safety">Keselamatan Anak</Link>
          <Link href="/delete-account">Hapus Akun</Link>
        </nav>
      </article>
    </main>
  )
}
