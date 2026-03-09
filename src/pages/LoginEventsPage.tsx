import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchAdminLoginEvents,
  getStoredAdminToken,
  type AdminLoginEvent,
} from '../api/backend-api'

type StatusFilter = 'all' | 'success' | 'failure'

const EVENT_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Не удалось загрузить логи входов.'
}

const toResultLabel = (event: AdminLoginEvent): string =>
  event.is_success ? 'Успешно' : 'Неуспешно'

const toRoleLabel = (role: AdminLoginEvent['user_role']): string => {
  if (role === 'super_admin') {
    return 'super_admin'
  }
  if (role === 'admin') {
    return 'admin'
  }
  if (role === 'specialist') {
    return 'specialist'
  }
  if (role === 'client') {
    return 'client'
  }
  return '—'
}

function LoginEventsPage() {
  const [events, setEvents] = useState<AdminLoginEvent[]>([])
  const [emailFilter, setEmailFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const payload = await fetchAdminLoginEvents(token, {
        limit: 300,
        success:
          statusFilter === 'all'
            ? undefined
            : statusFilter === 'success',
        email: emailFilter.trim() || undefined,
      })
      setEvents(payload)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [emailFilter, statusFilter])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const summary = useMemo(() => {
    const success = events.filter((event) => event.is_success).length
    const failed = events.length - success
    return { total: events.length, success, failed }
  }, [events])

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Логи входов</h1>
        <p>История авторизаций: успешные и неуспешные попытки, устройство и браузер.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Фильтры</h2>
          <div className="admin-actions-cell">
            <span>Всего: {summary.total}</span>
            <span>Успешно: {summary.success}</span>
            <span>Ошибки: {summary.failed}</span>
          </div>
        </div>
        <form
          className="admin-service-form"
          onSubmit={(event) => {
            event.preventDefault()
            void loadEvents()
          }}
        >
          <div className="admin-service-form__row">
            <label className="admin-form-field">
              <span>Email</span>
              <input
                type="text"
                value={emailFilter}
                onChange={(event) => setEmailFilter(event.currentTarget.value)}
                placeholder="Поиск по email"
              />
            </label>
            <label className="admin-form-field">
              <span>Результат</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}
              >
                <option value="all">Все</option>
                <option value="success">Только успешные</option>
                <option value="failure">Только ошибки</option>
              </select>
            </label>
          </div>
          <div className="admin-actions-cell">
            <button className="admin-inline-btn admin-inline-btn--accent" type="submit">
              Обновить
            </button>
          </div>
        </form>
      </article>

      <article className="admin-card admin-card--latest">
        <div className="admin-card__head">
          <h2>События входа</h2>
          <span>{isLoading ? 'загрузка...' : `${events.length} записей`}</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Email</th>
                <th>Результат</th>
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Браузер</th>
                <th>Устройство</th>
                <th>OS</th>
                <th>IP</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{EVENT_TIME_FORMATTER.format(new Date(event.created_at))}</td>
                  <td>{event.attempted_email}</td>
                  <td>{toResultLabel(event)}</td>
                  <td>{event.user_full_name || event.user_email || '—'}</td>
                  <td>{toRoleLabel(event.user_role)}</td>
                  <td>{event.browser || '—'}</td>
                  <td>{event.device_type || '—'}</td>
                  <td>{event.operating_system || '—'}</td>
                  <td>{event.ip_address}</td>
                  <td>{event.failure_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!events.length && !isLoading ? (
          <p className="admin-inline-note">Логов входов пока нет.</p>
        ) : null}
      </article>
    </section>
  )
}

export default LoginEventsPage
