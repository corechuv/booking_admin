import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchAdminBookings,
  getStoredAdminToken,
  updateAdminBooking,
  type AdminBooking,
  type UpdateAdminBookingPayload,
} from '../api/backend-api'
import {
  bookingStatusLabel,
  formatBookingTime,
} from '../lib/admin-format'
import BookingDetailsModal from '../components/BookingDetailsModal'

type CalendarCell = {
  date: Date
  key: string
  isCurrentMonth: boolean
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

const monthTitleFormatter = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
})

const selectedDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'Ошибка при работе с бронированиями.'
}

const getClientName = (booking: AdminBooking): string => {
  const value = booking.client?.full_name?.trim()
  return value && value.length > 0 ? value : `Client #${booking.client_id}`
}

const getClientEmail = (booking: AdminBooking): string =>
  booking.client?.email?.trim() || '—'

const getClientPhone = (booking: AdminBooking): string =>
  booking.client?.phone?.trim() || '—'

const slotDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const formatSlotDate = (startsAt: string): string =>
  slotDateFormatter.format(new Date(startsAt))

const formatSlotTimeRange = (startsAt: string, endsAt: string): string =>
  `${formatBookingTime(startsAt)} — ${formatBookingTime(endsAt)}`

const toDateKey = (value: Date): string => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDateKey = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const getMonthGrid = (monthStart: Date): CalendarCell[] => {
  const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
  const firstWeekday = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(firstDay)
  gridStart.setDate(firstDay.getDate() - firstWeekday)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return {
      date,
      key: toDateKey(date),
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
    }
  })
}

const sortBookingsByNewest = (left: AdminBooking, right: AdminBooking): number => {
  const leftCreated = Date.parse(left.created_at)
  const rightCreated = Date.parse(right.created_at)
  if (!Number.isNaN(leftCreated) && !Number.isNaN(rightCreated) && leftCreated !== rightCreated) {
    return rightCreated - leftCreated
  }
  return right.id - left.id
}

function BookingsPage() {
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSavingBooking, setIsSavingBooking] = useState(false)

  const loadBookings = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const nextBookings = await fetchAdminBookings(token)
      setBookings(nextBookings)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBookings()
  }, [loadBookings])

  const sortedBookings = useMemo(
    () => bookings.slice().sort(sortBookingsByNewest),
    [bookings],
  )
  const bookingCountByDateKey = useMemo(() => {
    const counter = new Map<string, number>()
    sortedBookings.forEach((booking) => {
      const key = toDateKey(new Date(booking.starts_at))
      counter.set(key, (counter.get(key) ?? 0) + 1)
    })
    return counter
  }, [sortedBookings])
  const calendarCells = useMemo(() => getMonthGrid(calendarMonth), [calendarMonth])
  const filteredBookings = useMemo(() => {
    if (!selectedDateKey) {
      return sortedBookings
    }
    return sortedBookings.filter(
      (booking) => toDateKey(new Date(booking.starts_at)) === selectedDateKey,
    )
  }, [selectedDateKey, sortedBookings])
  const selectedDateLabel = useMemo(
    () => (selectedDateKey ? selectedDateFormatter.format(parseDateKey(selectedDateKey)) : ''),
    [selectedDateKey],
  )
  const calendarMonthLabel = useMemo(() => {
    const raw = monthTitleFormatter.format(calendarMonth)
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }, [calendarMonth])

  const openBookingDetails = (booking: AdminBooking) => {
    setSelectedBooking(booking)
  }

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonth((currentMonth) =>
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1),
    )
  }

  const handlePickCalendarDate = (cell: CalendarCell) => {
    setSelectedDateKey(cell.key)
    setCalendarMonth(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1))
  }

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    booking: AdminBooking,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    openBookingDetails(booking)
  }

  const handleBookingSave = async (
    bookingId: number,
    payload: UpdateAdminBookingPayload,
  ) => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsSavingBooking(true)
    setError(null)

    try {
      const updatedBooking = await updateAdminBooking(token, bookingId, payload)
      setBookings((currentBookings) =>
        currentBookings.map((booking) =>
          booking.id === bookingId ? updatedBooking : booking,
        ),
      )
      setSelectedBooking(updatedBooking)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingBooking(false)
    }
  }

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Управление записями</h1>
        <p>Список бронирований и управление статусами записей.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card admin-card--latest">
        <div className="admin-card__head">
          <h2>Все бронирования</h2>
          <span>{filteredBookings.length} записей</span>
        </div>

        <div className="admin-bookings-layout">
          <section className="admin-booking-calendar" aria-label="Календарь записей">
            <div className="admin-booking-calendar__head">
              <button
                type="button"
                className="admin-calendar-nav"
                aria-label="Предыдущий месяц"
                onClick={() => shiftCalendarMonth(-1)}
              >
                ‹
              </button>
              <strong>{calendarMonthLabel}</strong>
              <button
                type="button"
                className="admin-calendar-nav"
                aria-label="Следующий месяц"
                onClick={() => shiftCalendarMonth(1)}
              >
                ›
              </button>
            </div>

            <div className="admin-booking-calendar__weekdays">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="admin-booking-calendar__grid">
              {calendarCells.map((cell) => {
                const count = bookingCountByDateKey.get(cell.key) ?? 0
                const isSelected = selectedDateKey === cell.key
                return (
                  <button
                    key={cell.key}
                    type="button"
                    className="admin-calendar-day"
                    data-outside-month={!cell.isCurrentMonth}
                    data-selected={isSelected}
                    onClick={() => handlePickCalendarDate(cell)}
                  >
                    <span>{cell.date.getDate()}</span>
                    {count > 0 ? <b>{count}</b> : null}
                  </button>
                )
              })}
            </div>

            <div className="admin-booking-calendar__footer">
              <button
                type="button"
                className="admin-inline-btn"
                onClick={() => setSelectedDateKey(null)}
              >
                Показать все
              </button>
              <span>
                {selectedDateKey
                  ? `Выбрано: ${selectedDateLabel}`
                  : 'Фильтр по дате выключен'}
              </span>
            </div>
          </section>

          <div className="admin-bookings-wrap">
            <table className="admin-table admin-table--bookings-summary">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Клиент</th>
                  <th>Процедура</th>
                  <th>Слот</th>
                  <th>Специалист</th>
                  <th>Согласие</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((row) => (
                  <tr
                    key={row.id}
                    className="admin-table-row-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openBookingDetails(row)}
                    onKeyDown={(event) => handleRowKeyDown(event, row)}
                  >
                    <td>#BK-{row.id}</td>
                    <td>
                      <div className="admin-client-cell">
                        <strong>{getClientName(row)}</strong>
                        <span>{getClientEmail(row)}</span>
                        <span>{getClientPhone(row)}</span>
                      </div>
                    </td>
                    <td>{row.service.title}</td>
                    <td>
                      <div className="admin-slot-cell">
                        <strong>{formatSlotDate(row.starts_at)}</strong>
                        <span>{formatSlotTimeRange(row.starts_at, row.ends_at)}</span>
                      </div>
                    </td>
                    <td>{row.specialist_name ?? 'Любой'}</td>
                    <td>{row.consent_accepted ? 'Да' : 'Нет'}</td>
                    <td>
                      <span className="admin-status">{bookingStatusLabel[row.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {!filteredBookings.length && !isLoading ? (
          <p className="admin-inline-note">Список бронирований пуст.</p>
        ) : null}
      </article>

      <BookingDetailsModal
        booking={selectedBooking}
        isSaving={isSavingBooking}
        onSave={handleBookingSave}
        onClose={() => setSelectedBooking(null)}
      />
    </section>
  )
}

export default BookingsPage
