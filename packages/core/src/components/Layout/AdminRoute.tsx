import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useIsAdmin } from '../../stores/auth'

/** Renders admin-only pages; everyone else is sent home. */
export default function AdminRoute({ children }: { children: ReactNode }) {
  return useIsAdmin() ? <>{children}</> : <Navigate to="/" replace />
}
