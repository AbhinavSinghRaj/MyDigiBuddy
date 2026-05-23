// app/dashboard/layout.tsx
// Protected sidebar layout. All /dashboard/* routes inherit this.
// Redirects unauthenticated users to /auth/login.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth/nextauth'
import Link from 'next/link'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/auth/login')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, borderRight: '1px solid #e5e7eb', padding: '24px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 20px 20px', fontWeight: 600, fontSize: 16 }}>
          ⚡ AdMind AI
        </div>

        <nav style={{ flex: 1 }}>
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavSection>Channels</NavSection>
          <NavLink href="/dashboard/google">Google Ads</NavLink>
          <NavLink href="/dashboard/meta">Meta Ads</NavLink>
          <NavSection>Account</NavSection>
          <NavLink href="/dashboard/billing">Billing</NavLink>
          <NavLink href="/dashboard/onboarding">Onboarding</NavLink>
        </nav>

        <div style={{ padding: '16px 20px', fontSize: 13, color: '#6b7280', borderTop: '1px solid #e5e7eb' }}>
          {session.user?.email}
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}

function NavSection({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', padding: '12px 20px 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{ display: 'block', padding: '8px 20px', fontSize: 14, color: '#374151', textDecoration: 'none' }}
    >
      {children}
    </Link>
  )
}
