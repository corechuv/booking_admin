import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import {
  fetchCurrentUser,
  getStoredAdminToken,
  isAdminLikeRole,
  isStaffUserRole,
  setStoredAdminToken,
  type AuthUser,
} from './api/backend-api'
import AdminLayout from './layout/AdminLayout'
import AdminUsersPage from './pages/AdminUsersPage'
import BookingsPage from './pages/BookingsPage'
import BookingsSchedulePage from './pages/BookingsSchedulePage'
import CategoriesPage from './pages/CategoriesPage'
import CertificatesPage from './pages/CertificatesPage'
import ContactsPage from './pages/ContactsPage'
import DashboardPage from './pages/DashboardPage'
import FaqPage from './pages/FaqPage'
import LanguagesPage from './pages/LanguagesPage'
import LoginPage from './pages/LoginPage'
import ServicesPage from './pages/ServicesPage'
import SpecialistsPage from './pages/SpecialistsPage'
import SpecialistDashboardPage from './pages/SpecialistDashboardPage'
import SpecialistHoursPage from './pages/SpecialistHoursPage'
import SpecialistProfilePage from './pages/SpecialistProfilePage'
import SetupPasswordPage from './pages/SetupPasswordPage'
import type { AppTheme } from './types/theme'
import { enableResponsiveTableLabels } from './lib/responsive-table'


const STORAGE_KEY = 'mira-admin-theme'

const getInitialTheme = (): AppTheme => {
  if (typeof window === 'undefined') {
    return 'mira-dark'
  }

  const savedTheme = window.localStorage.getItem(STORAGE_KEY)
  return savedTheme === 'mira-light' ? 'mira-light' : 'mira-dark'
}

const getDefaultPathByRole = (_role: AuthUser['role']): string => '/'

function App() {
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme)
  const [adminToken, setAdminToken] = useState<string>(getStoredAdminToken)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [isResolvingUser, setIsResolvingUser] = useState<boolean>(Boolean(adminToken))

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    setStoredAdminToken(adminToken)
  }, [adminToken])

  useEffect(() => {
    const cleanup = enableResponsiveTableLabels()
    return cleanup
  }, [])

  useEffect(() => {
    let isDisposed = false

    const resolveUser = async () => {
      if (!adminToken) {
        if (!isDisposed) {
          setAuthUser(null)
          setIsResolvingUser(false)
        }
        return
      }

      if (!isDisposed) {
        setIsResolvingUser(true)
      }

      try {
        const currentUser = await fetchCurrentUser(adminToken)
        if (!isStaffUserRole(currentUser.role)) {
          throw new Error('Account does not have staff role')
        }
        if (!isDisposed) {
          setAuthUser(currentUser)
        }
      } catch {
        if (!isDisposed) {
          setAdminToken('')
          setAuthUser(null)
        }
      } finally {
        if (!isDisposed) {
          setIsResolvingUser(false)
        }
      }
    }

    void resolveUser()

    return () => {
      isDisposed = true
    }
  }, [adminToken])

  const toggleTheme = useMemo(
    () => () =>
      setTheme((currentTheme) =>
        currentTheme === 'mira-dark' ? 'mira-light' : 'mira-dark',
      ),
    [],
  )

  const handleAuthenticated = (token: string, user: AuthUser) => {
    setAdminToken(token)
    setAuthUser(user)
  }

  const handleLogout = () => {
    setAdminToken('')
    setAuthUser(null)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/setup-password"
          element={<SetupPasswordPage theme={theme} onToggleTheme={toggleTheme} />}
        />
        <Route
          path="/login"
          element={
            adminToken && isResolvingUser ? (
              <main className="admin-page admin-login">
                <section className="admin-login__card">
                  <p>Проверяем доступ...</p>
                </section>
              </main>
            ) : adminToken && authUser ? (
              <Navigate to={getDefaultPathByRole(authUser.role)} replace />
            ) : (
              <LoginPage
                theme={theme}
                onToggleTheme={toggleTheme}
                onAuthenticated={handleAuthenticated}
              />
            )
          }
        />
        <Route
          path="/"
          element={
            adminToken && authUser ? (
              <AdminLayout
                authUser={authUser}
                theme={theme}
                onToggleTheme={toggleTheme}
                onLogout={handleLogout}
              />
            ) : isResolvingUser ? (
              <main className="admin-page admin-login">
                <section className="admin-login__card">
                  <p>Проверяем доступ...</p>
                </section>
              </main>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          {authUser && isAdminLikeRole(authUser.role) ? (
            <>
              <Route index element={<DashboardPage />} />
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="languages" element={<LanguagesPage />} />
              <Route path="faq" element={<FaqPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="certificates" element={<CertificatesPage />} />
            </>
          ) : null}

          {authUser && authUser.role === 'specialist' ? (
            <Route
              index
              element={<SpecialistDashboardPage currentUser={authUser} />}
            />
          ) : null}

          {authUser && (authUser.role === 'specialist' || isAdminLikeRole(authUser.role)) ? (
            <Route
              path="bookings/schedule"
              element={<BookingsSchedulePage currentUser={authUser} />}
            />
          ) : null}

          {authUser && (authUser.role === 'specialist' || isAdminLikeRole(authUser.role)) ? (
            <Route
              path="specialists"
              element={<SpecialistsPage currentUser={authUser} />}
            />
          ) : null}

          {authUser && authUser.role === 'specialist' ? (
            <>
              <Route
                path="specialists/profile"
                element={<SpecialistProfilePage />}
              />
              <Route
                path="specialists/hours"
                element={<SpecialistHoursPage currentUser={authUser} />}
              />
            </>
          ) : null}

          {authUser && isAdminLikeRole(authUser.role) ? (
            <Route path="admin-users" element={<AdminUsersPage currentUser={authUser} />} />
          ) : null}

          <Route
            path="*"
            element={
              authUser ? (
                <Navigate to={getDefaultPathByRole(authUser.role)} replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
