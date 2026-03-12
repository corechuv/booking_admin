import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { trackAdminVisit } from '../api/backend-api'

const ADMIN_VISIT_SESSION_KEY = 'mira_admin_visit_session_id'

const generateSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `admin-visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const getAdminVisitSessionId = (): string => {
  if (typeof window === 'undefined') {
    return generateSessionId()
  }

  const existing = window.sessionStorage.getItem(ADMIN_VISIT_SESSION_KEY)
  if (existing) {
    return existing
  }

  const sessionId = generateSessionId()
  window.sessionStorage.setItem(ADMIN_VISIT_SESSION_KEY, sessionId)
  return sessionId
}

type AdminVisitTrackerProps = {
  token: string
}

function AdminVisitTracker({ token }: AdminVisitTrackerProps) {
  const location = useLocation()
  const sessionId = useMemo(getAdminVisitSessionId, [])

  useEffect(() => {
    if (!token) {
      return
    }

    const path = `${location.pathname}${location.search}${location.hash}` || '/'
    const referrer = typeof document !== 'undefined' ? document.referrer || null : null
    const language = typeof navigator !== 'undefined' ? navigator.language || null : null

    void trackAdminVisit(token, {
      path,
      referrer,
      language,
      session_id: sessionId,
    }).catch(() => undefined)
  }, [location.hash, location.pathname, location.search, sessionId, token])

  return null
}

export default AdminVisitTracker
