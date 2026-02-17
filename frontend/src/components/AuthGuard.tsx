'use client';

import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/authContext'
import { ReactNode, useEffect } from 'react'

interface AuthGuardProps {
  children: ReactNode
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/auth/login')
    }
  }, [isAuthenticated, router])

  if (!isAuthenticated) {
    return <div className="text-center py-20 text-[var(--text-secondary)]">Redirecting to login...</div>
  }

  return <>{children}</>
}
