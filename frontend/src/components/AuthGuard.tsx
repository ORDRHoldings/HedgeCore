'use client';

import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/authContext'
import { ReactNode, useEffect } from 'react'

interface AuthGuardProps {
  children: ReactNode
  /** Optional: require specific permission to access this route */
  permission?: string
  /** Optional: require any of these permissions */
  anyPermission?: string[]
}

export default function AuthGuard({ children, permission, anyPermission }: AuthGuardProps) {
  const { isAuthenticated, isLoading, hasPermission, hasAnyPermission } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/auth/login')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="text-center py-20 text-[var(--text-secondary)]"
           style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.75rem" }}>
        Initializing session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-20 text-[var(--text-secondary)]"
           style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.75rem" }}>
        Redirecting to login...
      </div>
    );
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="text-center py-20 text-[var(--text-secondary)]"
           style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.75rem" }}>
        Access denied: insufficient permissions
      </div>
    );
  }

  if (anyPermission && anyPermission.length > 0 && !hasAnyPermission(...anyPermission)) {
    return (
      <div className="text-center py-20 text-[var(--text-secondary)]"
           style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.75rem" }}>
        Access denied: insufficient permissions
      </div>
    );
  }

  return <>{children}</>
}
