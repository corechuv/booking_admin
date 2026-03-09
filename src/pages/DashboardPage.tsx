import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchAdminBookings,
  fetchAdminStats,
  getStoredAdminToken,
  type AdminBooking,
  type AdminStats,
} from '../api/backend-api'
import {
  bookingStatusLabel,
  formatBookingDateShort,
  formatBookingTime,
  formatPrice,
} from '../lib/admin-format'
import BookingDetailsModal from '../components/BookingDetailsModal'

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'Не удалось загрузить дашборд.'
}

const parsePrice = (value: number | string): number => {
  if (typeof value === 'number') {
    return value
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getClientName = (booking: AdminBooking): string => {
  const value = booking.client?.full_name?.trim()
  return value && value.length > 0 ? value : `Client #${booking.client_id}`
}

const sortBookingsByNewest = (left: AdminBooking, right: AdminBooking): number => {
  const leftCreated = Date.parse(left.created_at)
  const rightCreated = Date.parse(right.created_at)
  if (!Number.isNaN(leftCreated) && !Number.isNaN(rightCreated) && leftCreated !== rightCreated) {
    return rightCreated - leftCreated
  }
  return right.id - left.id
}

function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [nextStats, nextBookings] = await Promise.all([
        fetchAdminStats(token),
        fetchAdminBookings(token),
      ])
      setStats(nextStats)
      setBookings(nextBookings)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const averageCheck = useMemo(() => {
    if (!bookings.length) {
      return 0
    }

    const total = bookings.reduce((sum, booking) => {
      return sum + parsePrice(booking.service.price)
    }, 0)

    return total / bookings.length
  }, [bookings])

  const loadPercent = useMemo(() => {
    if (!stats?.total_bookings) {
      return 0
    }

    return Math.round((stats.confirmed_bookings / stats.total_bookings) * 100)
  }, [stats])

  const kpiCards = [
    {
      label: 'Всего записей',
      value: stats?.total_bookings ?? 0,
      meta: isLoading ? 'загрузка...' : 'по текущей базе',
    },
    {
      label: 'Ожидают подтверждения',
      value: stats?.pending_bookings ?? 0,
      meta: 'статус pending',
    },
    {
      label: 'Средний чек',
      value: formatPrice(averageCheck),
      meta: 'по загруженным бронированиям',
    },
    {
      label: 'Подтверждено',
      value: `${loadPercent}%`,
      meta: `${stats?.confirmed_bookings ?? 0} из ${stats?.total_bookings ?? 0}`,
    },
  ]

  const sortedBookings = useMemo(
    () => bookings.slice().sort(sortBookingsByNewest),
    [bookings],
  )
  const recentBookings = sortedBookings.slice(0, 5)
  const incomingRequests = sortedBookings
    .filter((item) => item.status === 'pending')
    .slice(0, 3)

  const openBookingDetails = (booking: AdminBooking) => {
    setSelectedBooking(booking)
  }

  const handleRecentRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    booking: AdminBooking,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    openBookingDetails(booking)
  }

  return (
    <div className="admin-dashboard-page">
      <section className="admin-block">
        <div className="admin-block__head">
          <h1>Панель управления Mira</h1>
          <p>Ключевые метрики, активные записи и новые заявки.</p>
        </div>

        {error ? <p className="admin-inline-error">{error}</p> : null}

        <div className="admin-kpi-grid">
          {kpiCards.map((card) => (
            <article className="admin-kpi-card" key={card.label}>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.meta}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-block admin-block--split">
        <article className="admin-card admin-card--latest">
          <div className="admin-card__head">
            <h2>Последние записи</h2>
            <span>Нажмите на запись для деталей</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--recent-bookings">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Специалист</th>
                  <th>Клиент</th>
                  <th>Процедура</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((item) => (
                  <tr
                    key={item.id}
                    className="admin-table-row-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openBookingDetails(item)}
                    onKeyDown={(event) => handleRecentRowKeyDown(event, item)}
                  >
                    <td>{formatBookingTime(item.starts_at)}</td>
                    <td>{item.specialist_name ?? 'Без специалиста'}</td>
                    <td>{getClientName(item)}</td>
                    <td>{item.service.title}</td>
                    <td>
                      <span className="admin-status">{bookingStatusLabel[item.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!recentBookings.length && !isLoading ? (
            <p className="admin-inline-note">Пока нет бронирований.</p>
          ) : null}
        </article>

        <article className="admin-card">
          <div className="admin-card__head">
            <h2>Новые заявки</h2>
            <span>Top 3 pending</span>
          </div>
          <ul className="admin-content-list">
            {incomingRequests.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>
                    #BK-{item.id} · {getClientName(item)}
                  </strong>
                  <span>{item.service.title}</span>
                </div>
                <b>
                  {formatBookingDateShort(item.starts_at)} · {formatBookingTime(item.starts_at)}
                </b>
              </li>
            ))}
          </ul>

          {!incomingRequests.length && !isLoading ? (
            <p className="admin-inline-note">Новых pending заявок нет.</p>
          ) : null}
        </article>
      </section>

      <BookingDetailsModal
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />
    </div>
  )
}

export default DashboardPage
