import { type FormEvent, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, completePasswordSetup } from '../api/backend-api'
import type { AppTheme } from '../types/theme'

type SetupPasswordPageProps = {
  theme: AppTheme
  onToggleTheme: () => void
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Не удалось установить пароль. Попробуйте еще раз.'
}

function SetupPasswordPage({ theme, onToggleTheme }: SetupPasswordPageProps) {
  const [searchParams] = useSearchParams()
  const token = useMemo(() => (searchParams.get('token') ?? '').trim(), [searchParams])

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!token) {
      setError('Ссылка установки пароля некорректна.')
      return
    }
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов.')
      return
    }
    if (password !== confirmPassword) {
      setError('Подтверждение пароля не совпадает.')
      return
    }

    setIsSubmitting(true)
    try {
      await completePasswordSetup({ token, password })
      setSuccess('Пароль установлен. Теперь вы можете войти в админку.')
      setPassword('')
      setConfirmPassword('')
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
          <h1>Установка пароля</h1>
          <p>Создайте пароль для доступа в админку.</p>
        </div>

        {!token ? <p className="admin-login__error">Ссылка установки пароля недействительна.</p> : null}

        <form className="admin-login__form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>Новый пароль</span>
            <input
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              minLength={8}
              required
              disabled={!token || isSubmitting || Boolean(success)}
            />
          </label>

          <label>
            <span>Повторите пароль</span>
            <input
              name="confirm_password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              minLength={8}
              required
              disabled={!token || isSubmitting || Boolean(success)}
            />
          </label>

          {error ? <p className="admin-login__error">{error}</p> : null}
          {success ? <p className="admin-inline-note">{success}</p> : null}

          <button type="submit" disabled={!token || isSubmitting || Boolean(success)}>
            {isSubmitting ? 'Сохраняем...' : 'Установить пароль'}
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
          <Link className="admin-inline-link" to="/login">
            К странице входа
          </Link>
        </div>
      </section>
    </main>
  )
}

export default SetupPasswordPage
