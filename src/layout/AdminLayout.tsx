import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { isAdminLikeRole, type AuthUser } from '../api/backend-api'
import { CloseIcon, MenuIcon } from '../components/icons'
import { lockBodyScroll } from '../lib/body-scroll-lock'
import type { AppTheme } from '../types/theme'

type AdminLayoutProps = {
  authUser: AuthUser
  theme: AppTheme
  onToggleTheme: () => void
  onLogout: () => void
}

type NavLinkItem = {
  to: string
  label: string
  end?: boolean
}

const getNavLinks = (role: AuthUser['role']): NavLinkItem[] => {
  if (role === 'specialist') {
    return [
      { to: '/', label: 'Обзор', end: true },
      { to: '/bookings/schedule', label: 'Мой календарь' },
      { to: '/clients', label: 'Мои клиенты' },
      { to: '/specialists/hours', label: 'Мой график' },
      { to: '/specialists/profile', label: 'Мой профиль' },
      { to: '/specialists', label: 'Мои услуги', end: true },
    ]
  }

  const links: NavLinkItem[] = [
    { to: '/', label: 'Обзор', end: true },
    { to: '/bookings', label: 'Записи' },
    { to: '/clients', label: 'Клиенты' },
    { to: '/bookings/schedule', label: 'Календарь' },
    { to: '/categories', label: 'Категории' },
    { to: '/services', label: 'Процедуры' },
    { to: '/languages', label: 'Языки' },
    { to: '/faq', label: 'FAQ' },
    { to: '/contacts', label: 'Контакты' },
    { to: '/certificates', label: 'Сертификаты' },
  ]

  if (isAdminLikeRole(role)) {
    links.splice(6, 0, { to: '/specialists', label: 'Специалисты' })
  }

  if (isAdminLikeRole(role)) {
    links.push({ to: '/admin-users', label: 'Админы' })
  }

  if (isAdminLikeRole(role)) {
    links.push({ to: '/login-events', label: 'Посещения' })
  }

  return links
}

function AdminLayout({ authUser, theme, onToggleTheme, onLogout }: AdminLayoutProps) {
  const clientAppUrl =
    import.meta.env.VITE_CLIENT_APP_URL?.trim() || 'http://localhost:5173'
  const [isNavOpen, setIsNavOpen] = useState(false)
  const navLinks = getNavLinks(authUser.role)

  useEffect(() => {
    if (!isNavOpen) {
      return
    }

    const releaseBodyScrollLock = lockBodyScroll()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      releaseBodyScrollLock()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isNavOpen])

  return (
    <main className="admin-page">
      <div className="admin-page__shell">
        <header className="admin-topbar">
          <Link
            className="admin-topbar__brand"
            to="/"
            aria-label="Mira admin home"
          >
            <img src="/logo_full.png" alt="Mira logo" />
            <span>admin</span>
          </Link>

          <div className="admin-topbar__actions">
            <button
              className="admin-menu-toggle"
              type="button"
              onClick={() => setIsNavOpen(true)}
              aria-label="Открыть навигацию"
            >
              <MenuIcon size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="admin-content">
          <Outlet />
        </div>
      </div>

      {isNavOpen ? (
        <div className="admin-nav-overlay" role="presentation" onClick={() => setIsNavOpen(false)}>
          <aside
            className="admin-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Навигация админки"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-nav-drawer__head">
              <button
                type="button"
                className="admin-nav-drawer__close"
                aria-label="Закрыть навигацию"
                onClick={() => setIsNavOpen(false)}
              >
                <CloseIcon size={20} aria-hidden="true" />
              </button>
            </div>

            <nav className="admin-nav-drawer__links" aria-label="Admin navigation">
              {navLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? 'admin-nav-drawer__link is-active' : 'admin-nav-drawer__link'
                  }
                  onClick={() => setIsNavOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="admin-nav-drawer__actions">
              <p className="admin-inline-note">
                {isAdminLikeRole(authUser.role) ? 'Staff panel' : 'Specialist panel'}: {authUser.full_name}
              </p>
              <a className="admin-button" href={clientAppUrl} target="_blank" rel="noreferrer">
                Клиентский сайт
              </a>
              <button
                className="admin-theme-toggle"
                type="button"
                onClick={onToggleTheme}
                aria-label={
                  theme === 'mira-dark'
                    ? 'Переключить на светлую тему'
                    : 'Переключить на темную тему'
                }
              >
                {theme === 'mira-dark' ? 'Светлая тема' : 'Темная тема'}
              </button>
              <button
                className="admin-theme-toggle"
                type="button"
                onClick={onLogout}
                aria-label="Выйти из админки"
              >
                Выйти
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  )
}

export default AdminLayout
