import { type FormEvent, useState } from 'react'
import {
  ApiError,
  fetchCurrentUser,
  isStaffUserRole,
  login,
  type AuthUser,
} from '../api/backend-api'
import type { AppTheme } from '../types/theme'

type LoginPageProps = {
  theme: AppTheme
  onToggleTheme: () => void
  onAuthenticated: (token: string, user: AuthUser) => void
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'У аккаунта нет доступа к панели.'
    }

    return error.message
  }

  return 'Ошибка соединения с сервером.'
}

function LoginPage({ theme, onToggleTheme, onAuthenticated }: LoginPageProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '').trim()

    setIsSubmitting(true)

    try {
      const authResponse = await login({ email, password })
      const currentUser = await fetchCurrentUser(authResponse.access_token)
      if (!isStaffUserRole(currentUser.role)) {
        setError('У аккаунта нет доступа к staff-панели.')
        return
      }
      onAuthenticated(authResponse.access_token, currentUser)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="admin-page admin-login">
      <div className="admin-page__glow admin-page__glow--left" />
      <div className="admin-page__glow admin-page__glow--right" />

      <section className="admin-login__card">
        <div className="admin-login__head">
          <img src="/logo_full.png" alt="Mira logo" />
          <h1>Панель управления.</h1>
        </div>

        <form className="admin-login__form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              placeholder="admin@mira-salon.com"
              required
            />
          </label>

          <label>
            <span>Пароль</span>
            <input
              name="password"
              type="password"
              placeholder="Введите пароль"
              required
            />
          </label>

          {error ? <p className="admin-login__error">{error}</p> : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Проверяем...' : 'Войти'}
          </button>
        </form>

        <div className="admin-login__footer">
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
            {theme === 'mira-dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </section>
    </main>
  )
}

export default LoginPage
