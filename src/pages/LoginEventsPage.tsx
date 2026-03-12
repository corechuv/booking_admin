import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchAdminVisitEvents,
  getStoredAdminToken,
  type AdminVisitEvent,
} from '../api/backend-api'

const EVENT_TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Не удалось загрузить посещения.'
}

function LoginEventsPage() {
  const [events, setEvents] = useState<AdminVisitEvent[]>([])
  const [sourceFilter, setSourceFilter] = useState<'all' | 'client' | 'admin'>('all')
  const [searchFilter, setSearchFilter] = useState('')
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
      const payload = await fetchAdminVisitEvents(token, {
        limit: 400,
        source: sourceFilter,
        search: searchFilter.trim() || undefined,
      })
      setEvents(payload)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [searchFilter, sourceFilter])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const summary = useMemo(() => {
    const uniqueIps = new Set(events.map((event) => event.ip_address)).size
    const uniqueSessions = new Set(
      events
        .map((event) => event.session_id)
        .filter((value): value is string => Boolean(value)),
    ).size
    const clientEvents = events.filter((event) => event.source === 'client').length
    const adminEvents = events.filter((event) => event.source === 'admin').length
    return {
      total: events.length,
      uniqueIps,
      uniqueSessions,
      clientEvents,
      adminEvents,
    }
  }, [events])

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Посещения сайта</h1>
        <p>Клиентский сайт: анонимно. Админка: только по авторизованному входу.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Фильтр</h2>
          <div className="admin-actions-cell">
            <span>Всего: {summary.total}</span>
            <span>IP: {summary.uniqueIps}</span>
            <span>Сессий: {summary.uniqueSessions}</span>
            <span>Клиент: {summary.clientEvents}</span>
            <span>Админка: {summary.adminEvents}</span>
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
              <span>Источник</span>
              <select
                value={sourceFilter}
                onChange={(event) =>
                  setSourceFilter(event.currentTarget.value as 'all' | 'client' | 'admin')
                }
              >
                <option value="all">Все</option>
                <option value="client">Клиент (анонимно)</option>
                <option value="admin">Админка (по логину)</option>
              </select>
            </label>
            <label className="admin-form-field">
              <span>Поиск</span>
              <input
                type="text"
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.currentTarget.value)}
                placeholder="IP / страница / браузер / реферер / пользователь"
              />
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
          <h2>События посещений</h2>
          <span>{isLoading ? 'загрузка...' : `${events.length} записей`}</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Источник</th>
                <th>Доступ</th>
                <th>Пользователь</th>
                <th>Страница</th>
                <th>IP</th>
                <th>Браузер</th>
                <th>Устройство</th>
                <th>OS</th>
                <th>Язык</th>
                <th>Источник</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{EVENT_TIME_FORMATTER.format(new Date(event.created_at))}</td>
                  <td>{event.source === 'admin' ? 'Админка' : 'Клиент'}</td>
                  <td>{event.access_mode === 'authenticated' ? 'По логину' : 'Анонимно'}</td>
                  <td>{event.actor_user_email || event.actor_user_name || '—'}</td>
                  <td>{event.path}</td>
                  <td>{event.ip_address}</td>
                  <td>{event.browser || '—'}</td>
                  <td>{event.device_type || '—'}</td>
                  <td>{event.operating_system || '—'}</td>
                  <td>{event.language || '—'}</td>
                  <td>{event.referrer || '—'}</td>
                  <td>{event.session_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!events.length && !isLoading ? (
          <p className="admin-inline-note">Посещений пока нет.</p>
        ) : null}
      </article>
    </section>
  )
}

export default LoginEventsPage
