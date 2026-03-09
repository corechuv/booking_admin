import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchAdminBookings,
  fetchAdminServices,
  fetchAdminSpecialistHours,
  getStoredAdminToken,
  type AdminBooking,
  type AdminHourSlot,
  type AdminService,
  type AuthUser,
} from '../api/backend-api'
import {
  bookingStatusLabel,
  formatBookingDateShort,
  formatBookingTime,
  formatPrice,
} from '../lib/admin-format'
import BookingDetailsModal from '../components/BookingDetailsModal'

type SpecialistDashboardPageProps = {
  currentUser: AuthUser
}

type ServiceMetric = {
  serviceId: number
  title: string
  category: string
  count: number
  completedCount: number
  revenueAll: number
  revenueCompleted: number
  durationMinutesTotal: number
}

const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'completed'])
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
})
const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Не удалось загрузить аналитический дашборд специалиста.'
}

const parsePrice = (value: number | string): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toBusinessDayIndex = (date: Date): number => (date.getDay() + 6) % 7

const parseTimeToMinutes = (value: string | null): number | null => {
  if (!value) {
    return null
  }
  const [hoursRaw, minutesRaw] = value.split(':')
  const hours = Number.parseInt(hoursRaw, 10)
  const minutes = Number.parseInt(minutesRaw, 10)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }
  return hours * 60 + minutes
}

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0%'
  }
  const fixed = value.toFixed(1).replace(/\.0$/, '')
  return `${fixed}%`
}

const formatDeltaPercent = (current: number, previous: number): string => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return '0%'
  }

  if (previous === 0) {
    if (current === 0) {
      return '0%'
    }
    return '+100%'
  }

  const delta = ((current - previous) / previous) * 100
  const rounded = Number(delta.toFixed(1))
  const prefix = rounded > 0 ? '+' : ''
  return `${prefix}${rounded.toString().replace(/\.0$/, '')}%`
}

const formatHoursByMinutes = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0 ч'
  }
  const value = (minutes / 60).toFixed(1).replace(/\.0$/, '')
  return `${value} ч`
}

const toMonthStart = (year: number, month: number): Date =>
  new Date(year, month, 1, 0, 0, 0, 0)

const isDateInRange = (value: Date, fromInclusive: Date, toExclusive: Date): boolean =>
  value.getTime() >= fromInclusive.getTime() && value.getTime() < toExclusive.getTime()

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

const buildSpecialistHoursMap = (
  slots: AdminHourSlot[],
): Map<number, Array<{ open: number; close: number }>> => {
  const byDay = new Map<number, Array<{ open: number; close: number }>>()
  for (let day = 0; day < 7; day += 1) {
    byDay.set(day, [])
  }

  const grouped = new Map<number, AdminHourSlot[]>()
  for (const slot of slots) {
    const current = grouped.get(slot.day_of_week) ?? []
    current.push(slot)
    grouped.set(slot.day_of_week, current)
  }

  grouped.forEach((daySlots, day) => {
    if (daySlots.some((slot) => slot.is_closed)) {
      byDay.set(day, [])
      return
    }

    const intervals = daySlots
      .map((slot) => {
        const open = parseTimeToMinutes(slot.open_time)
        const close = parseTimeToMinutes(slot.close_time)
        if (open === null || close === null || close <= open) {
          return null
        }
        return { open, close }
      })
      .filter((interval): interval is { open: number; close: number } => Boolean(interval))
      .sort((left, right) => left.open - right.open || left.close - right.close)

    byDay.set(day, intervals)
  })

  return byDay
}

const computeAvailableMinutesInMonth = (
  hoursSlots: AdminHourSlot[],
  year: number,
  month: number,
): number => {
  if (!hoursSlots.length) {
    return 0
  }

  const byDay = buildSpecialistHoursMap(hoursSlots)
  const monthStart = toMonthStart(year, month)
  const monthEnd = toMonthStart(year, month + 1)
  let totalMinutes = 0

  for (
    let dayCursor = new Date(monthStart);
    dayCursor.getTime() < monthEnd.getTime();
    dayCursor.setDate(dayCursor.getDate() + 1)
  ) {
    const businessDay = toBusinessDayIndex(dayCursor)
    const intervals = byDay.get(businessDay) ?? []
    for (const interval of intervals) {
      totalMinutes += interval.close - interval.open
    }
  }

  return totalMinutes
}

function SpecialistDashboardPage({ currentUser }: SpecialistDashboardPageProps) {
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [services, setServices] = useState<AdminService[]>([])
  const [hoursSlots, setHoursSlots] = useState<AdminHourSlot[]>([])
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
      const [nextBookings, nextServices, specialistHours] = await Promise.all([
        fetchAdminBookings(token),
        fetchAdminServices(token),
        fetchAdminSpecialistHours(token, currentUser.id),
      ])

      setBookings(nextBookings)
      setServices(nextServices.filter((service) => service.is_active))
      setHoursSlots(specialistHours.slots)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const now = useMemo(() => new Date(), [])
  const currentMonthStart = useMemo(
    () => toMonthStart(now.getFullYear(), now.getMonth()),
    [now],
  )
  const nextMonthStart = useMemo(
    () => toMonthStart(now.getFullYear(), now.getMonth() + 1),
    [now],
  )
  const previousMonthStart = useMemo(
    () => toMonthStart(now.getFullYear(), now.getMonth() - 1),
    [now],
  )
  const currentMonthLabel = useMemo(
    () => MONTH_LABEL_FORMATTER.format(currentMonthStart),
    [currentMonthStart],
  )

  const sortedBookings = useMemo(
    () => bookings.slice().sort(sortBookingsByNewest),
    [bookings],
  )

  const totalBookings = sortedBookings.length
  const pendingCount = sortedBookings.filter((booking) => booking.status === 'pending').length
  const confirmedCount = sortedBookings.filter((booking) => booking.status === 'confirmed').length
  const completedCount = sortedBookings.filter((booking) => booking.status === 'completed').length
  const canceledCount = sortedBookings.filter((booking) => booking.status === 'canceled').length

  const activeCount = pendingCount + confirmedCount + completedCount
  const completionRate = activeCount > 0 ? (completedCount / activeCount) * 100 : 0
  const cancellationRate = totalBookings > 0 ? (canceledCount / totalBookings) * 100 : 0

  const upcomingBookings = useMemo(
    () =>
      sortedBookings
        .filter((booking) => {
          const startsAt = new Date(booking.starts_at)
          return startsAt.getTime() >= now.getTime() && ACTIVE_BOOKING_STATUSES.has(booking.status)
        })
        .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at)),
    [now, sortedBookings],
  )
  const nearestBookings = upcomingBookings.slice(0, 10)

  const currentMonthBookings = useMemo(
    () =>
      sortedBookings.filter((booking) =>
        isDateInRange(new Date(booking.starts_at), currentMonthStart, nextMonthStart),
      ),
    [currentMonthStart, nextMonthStart, sortedBookings],
  )
  const previousMonthBookings = useMemo(
    () =>
      sortedBookings.filter((booking) =>
        isDateInRange(new Date(booking.starts_at), previousMonthStart, currentMonthStart),
      ),
    [currentMonthStart, previousMonthStart, sortedBookings],
  )

  const currentMonthBookingsCount = currentMonthBookings.length
  const previousMonthBookingsCount = previousMonthBookings.length

  const completedRevenueAll = useMemo(
    () =>
      sortedBookings.reduce((sum, booking) => {
        if (booking.status !== 'completed') {
          return sum
        }
        return sum + parsePrice(booking.service.price)
      }, 0),
    [sortedBookings],
  )

  const pipelineRevenue = useMemo(
    () =>
      sortedBookings.reduce((sum, booking) => {
        if (booking.status !== 'pending' && booking.status !== 'confirmed') {
          return sum
        }
        return sum + parsePrice(booking.service.price)
      }, 0),
    [sortedBookings],
  )

  const currentMonthCompletedRevenue = useMemo(
    () =>
      currentMonthBookings.reduce((sum, booking) => {
        if (booking.status !== 'completed') {
          return sum
        }
        return sum + parsePrice(booking.service.price)
      }, 0),
    [currentMonthBookings],
  )
  const previousMonthCompletedRevenue = useMemo(
    () =>
      previousMonthBookings.reduce((sum, booking) => {
        if (booking.status !== 'completed') {
          return sum
        }
        return sum + parsePrice(booking.service.price)
      }, 0),
    [previousMonthBookings],
  )

  const averageCompletedCheckCurrentMonth = useMemo(() => {
    const completedInMonth = currentMonthBookings.filter(
      (booking) => booking.status === 'completed',
    )
    if (!completedInMonth.length) {
      return 0
    }
    return currentMonthCompletedRevenue / completedInMonth.length
  }, [currentMonthBookings, currentMonthCompletedRevenue])

  const averageDurationMinutes = useMemo(() => {
    if (!sortedBookings.length) {
      return 0
    }
    const totalDuration = sortedBookings.reduce(
      (sum, booking) => sum + booking.service.duration_minutes,
      0,
    )
    return totalDuration / sortedBookings.length
  }, [sortedBookings])

  const bookedMinutesCurrentMonth = useMemo(
    () =>
      currentMonthBookings.reduce((sum, booking) => {
        if (booking.status === 'canceled') {
          return sum
        }
        return sum + booking.service.duration_minutes
      }, 0),
    [currentMonthBookings],
  )

  const availableMinutesCurrentMonth = useMemo(
    () => computeAvailableMinutesInMonth(hoursSlots, now.getFullYear(), now.getMonth()),
    [hoursSlots, now],
  )

  const utilizationPercentCurrentMonth = useMemo(() => {
    if (availableMinutesCurrentMonth <= 0) {
      return 0
    }
    return (bookedMinutesCurrentMonth / availableMinutesCurrentMonth) * 100
  }, [availableMinutesCurrentMonth, bookedMinutesCurrentMonth])

  const uniqueClientsCount = useMemo(
    () => new Set(sortedBookings.map((booking) => booking.client_id)).size,
    [sortedBookings],
  )

  const repeatClientsCount = useMemo(() => {
    const counts = new Map<number, number>()
    for (const booking of sortedBookings) {
      counts.set(booking.client_id, (counts.get(booking.client_id) ?? 0) + 1)
    }
    return Array.from(counts.values()).filter((value) => value > 1).length
  }, [sortedBookings])

  const repeatClientsRate = uniqueClientsCount > 0
    ? (repeatClientsCount / uniqueClientsCount) * 100
    : 0

  const newClientsCurrentMonth = useMemo(() => {
    const firstByClient = new Map<number, Date>()
    for (const booking of sortedBookings) {
      const startsAt = new Date(booking.starts_at)
      const current = firstByClient.get(booking.client_id)
      if (!current || startsAt.getTime() < current.getTime()) {
        firstByClient.set(booking.client_id, startsAt)
      }
    }
    let count = 0
    firstByClient.forEach((firstDate) => {
      if (isDateInRange(firstDate, currentMonthStart, nextMonthStart)) {
        count += 1
      }
    })
    return count
  }, [currentMonthStart, nextMonthStart, sortedBookings])

  const statusDistribution = useMemo(
    () => {
      const total = Math.max(totalBookings, 1)
      return [
        { key: 'pending', label: bookingStatusLabel.pending, value: pendingCount, percent: (pendingCount / total) * 100 },
        { key: 'confirmed', label: bookingStatusLabel.confirmed, value: confirmedCount, percent: (confirmedCount / total) * 100 },
        { key: 'completed', label: bookingStatusLabel.completed, value: completedCount, percent: (completedCount / total) * 100 },
        { key: 'canceled', label: bookingStatusLabel.canceled, value: canceledCount, percent: (canceledCount / total) * 100 },
      ]
    },
    [canceledCount, completedCount, confirmedCount, pendingCount, totalBookings],
  )

  const servicesById = useMemo(() => {
    const map = new Map<number, AdminService>()
    for (const service of services) {
      map.set(service.id, service)
    }
    return map
  }, [services])

  const topServiceMetrics = useMemo(() => {
    const byService = new Map<number, ServiceMetric>()

    for (const booking of sortedBookings) {
      const fallbackService = booking.service
      const sourceService = servicesById.get(booking.service_id) ?? fallbackService
      const existing = byService.get(sourceService.id) ?? {
        serviceId: sourceService.id,
        title: sourceService.title,
        category: sourceService.category,
        count: 0,
        completedCount: 0,
        revenueAll: 0,
        revenueCompleted: 0,
        durationMinutesTotal: 0,
      }

      const price = parsePrice(sourceService.price)
      existing.count += 1
      existing.durationMinutesTotal += sourceService.duration_minutes
      if (booking.status !== 'canceled') {
        existing.revenueAll += price
      }
      if (booking.status === 'completed') {
        existing.completedCount += 1
        existing.revenueCompleted += price
      }

      byService.set(sourceService.id, existing)
    }

    return Array.from(byService.values())
      .sort((left, right) => right.count - left.count || right.revenueAll - left.revenueAll)
      .slice(0, 8)
  }, [servicesById, sortedBookings])

  const weekdayLoad = useMemo(() => {
    const buckets = WEEKDAY_LABELS.map((label) => ({ label, count: 0, completed: 0 }))
    for (const booking of sortedBookings) {
      if (booking.status === 'canceled') {
        continue
      }
      const dayIndex = toBusinessDayIndex(new Date(booking.starts_at))
      const bucket = buckets[dayIndex]
      if (!bucket) {
        continue
      }
      bucket.count += 1
      if (booking.status === 'completed') {
        bucket.completed += 1
      }
    }
    const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1)
    return buckets.map((bucket) => ({
      ...bucket,
      percent: (bucket.count / maxCount) * 100,
    }))
  }, [sortedBookings])

  const peakHours = useMemo(() => {
    const byHour = new Map<number, number>()
    for (const booking of sortedBookings) {
      if (booking.status === 'canceled') {
        continue
      }
      const hour = new Date(booking.starts_at).getHours()
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1)
    }
    const list = Array.from(byHour.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((left, right) => right.count - left.count || left.hour - right.hour)
      .slice(0, 6)
    const maxCount = Math.max(...list.map((item) => item.count), 1)
    return list.map((item) => ({
      ...item,
      percent: (item.count / maxCount) * 100,
      label: `${String(item.hour).padStart(2, '0')}:00`,
    }))
  }, [sortedBookings])

  const averageLeadTimeHours = useMemo(() => {
    if (!sortedBookings.length) {
      return 0
    }
    const diffs = sortedBookings
      .map((booking) => Date.parse(booking.starts_at) - Date.parse(booking.created_at))
      .filter((diff) => Number.isFinite(diff) && diff > 0)
    if (!diffs.length) {
      return 0
    }
    const averageMs = diffs.reduce((sum, value) => sum + value, 0) / diffs.length
    return averageMs / (1000 * 60 * 60)
  }, [sortedBookings])

  const kpiCards = [
    {
      label: 'Записей всего',
      value: totalBookings,
      meta: `${currentMonthLabel}: ${currentMonthBookingsCount} (${formatDeltaPercent(
        currentMonthBookingsCount,
        previousMonthBookingsCount,
      )})`,
    },
    {
      label: 'Ближайшие записи',
      value: upcomingBookings.length,
      meta: 'pending + confirmed',
    },
    {
      label: 'Подтверждение в завершение',
      value: formatPercent(completionRate),
      meta: `${completedCount} завершено из ${activeCount}`,
    },
    {
      label: 'Отмены',
      value: formatPercent(cancellationRate),
      meta: `${canceledCount} отменено`,
    },
    {
      label: 'Выручка завершено',
      value: formatPrice(completedRevenueAll),
      meta: `${currentMonthLabel}: ${formatPrice(currentMonthCompletedRevenue)} (${formatDeltaPercent(
        currentMonthCompletedRevenue,
        previousMonthCompletedRevenue,
      )})`,
    },
    {
      label: 'Пайплайн выручки',
      value: formatPrice(pipelineRevenue),
      meta: 'pending + confirmed',
    },
    {
      label: 'Средний чек',
      value: formatPrice(averageCompletedCheckCurrentMonth),
      meta: `${currentMonthLabel}, completed`,
    },
    {
      label: 'Загрузка месяца',
      value: formatPercent(utilizationPercentCurrentMonth),
      meta: `${formatHoursByMinutes(bookedMinutesCurrentMonth)} из ${formatHoursByMinutes(availableMinutesCurrentMonth)}`,
    },
    {
      label: 'Клиенты',
      value: uniqueClientsCount,
      meta: `новых: ${newClientsCurrentMonth} · повторных: ${formatPercent(repeatClientsRate)}`,
    },
    {
      label: 'Средняя длительность',
      value: `${Math.round(averageDurationMinutes)} мин`,
      meta: `lead time: ${averageLeadTimeHours.toFixed(1).replace(/\.0$/, '')} ч`,
    },
  ]

  const openBookingDetails = (booking: AdminBooking) => {
    setSelectedBooking(booking)
  }

  const handleUpcomingRowKeyDown = (
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
          <h1>Дашборд специалиста</h1>
          <p>Детальная аналитика по записям, загрузке, выручке и качеству расписания.</p>
        </div>

        {error ? <p className="admin-inline-error">{error}</p> : null}

        <div className="admin-kpi-grid admin-kpi-grid--specialist">
          {kpiCards.map((card) => (
            <article className="admin-kpi-card" key={card.label}>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.meta}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-block admin-specialist-grid">
        <article className="admin-card">
          <div className="admin-card__head">
            <h2>Распределение статусов</h2>
            <span>{totalBookings} записей</span>
          </div>
          <ul className="admin-stat-list">
            {statusDistribution.map((status) => (
              <li key={status.key} className="admin-stat-item">
                <div className="admin-stat-item__row">
                  <strong>{status.label}</strong>
                  <b>{status.value}</b>
                </div>
                <div className="admin-loadbar">
                  <span style={{ width: `${status.percent}%` }} />
                </div>
                <span className="admin-stat-item__meta">{formatPercent(status.percent)}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-card">
          <div className="admin-card__head">
            <h2>Загрузка по дням</h2>
            <span>факт по неделе</span>
          </div>
          <ul className="admin-stat-list">
            {weekdayLoad.map((day) => (
              <li key={day.label} className="admin-stat-item">
                <div className="admin-stat-item__row">
                  <strong>{day.label}</strong>
                  <b>{day.count}</b>
                </div>
                <div className="admin-loadbar">
                  <span style={{ width: `${day.percent}%` }} />
                </div>
                <span className="admin-stat-item__meta">
                  завершено: {day.completed}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-card">
          <div className="admin-card__head">
            <h2>Пиковые часы</h2>
            <span>топ по количеству</span>
          </div>
          <ul className="admin-stat-list">
            {peakHours.map((hour) => (
              <li key={hour.hour} className="admin-stat-item">
                <div className="admin-stat-item__row">
                  <strong>{hour.label}</strong>
                  <b>{hour.count}</b>
                </div>
                <div className="admin-loadbar">
                  <span style={{ width: `${hour.percent}%` }} />
                </div>
              </li>
            ))}
            {!peakHours.length && !isLoading ? (
              <li className="admin-stat-item">
                <span className="admin-stat-item__meta">Пока недостаточно данных.</span>
              </li>
            ) : null}
          </ul>
        </article>

        <article className="admin-card">
          <div className="admin-card__head">
            <h2>Текущая финансовая картина</h2>
            <span>{currentMonthLabel}</span>
          </div>
          <ul className="admin-stat-list">
            <li className="admin-stat-item">
              <div className="admin-stat-item__row">
                <strong>Выручка (completed)</strong>
                <b>{formatPrice(currentMonthCompletedRevenue)}</b>
              </div>
              <span className="admin-stat-item__meta">
                к прошлому месяцу: {formatDeltaPercent(
                  currentMonthCompletedRevenue,
                  previousMonthCompletedRevenue,
                )}
              </span>
            </li>
            <li className="admin-stat-item">
              <div className="admin-stat-item__row">
                <strong>Средний чек (completed)</strong>
                <b>{formatPrice(averageCompletedCheckCurrentMonth)}</b>
              </div>
              <span className="admin-stat-item__meta">
                по {currentMonthBookings.filter((booking) => booking.status === 'completed').length} завершенным
              </span>
            </li>
            <li className="admin-stat-item">
              <div className="admin-stat-item__row">
                <strong>Запланировано часов</strong>
                <b>{formatHoursByMinutes(availableMinutesCurrentMonth)}</b>
              </div>
              <span className="admin-stat-item__meta">
                фактически занято: {formatHoursByMinutes(bookedMinutesCurrentMonth)}
              </span>
            </li>
          </ul>
        </article>
      </section>

      <section className="admin-block">
        <article className="admin-card admin-card--latest">
          <div className="admin-card__head">
            <h2>Топ услуг по записям</h2>
            <span>count / выручка / завершения</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Услуга</th>
                  <th>Категория</th>
                  <th>Записей</th>
                  <th>Завершено</th>
                  <th>Выручка</th>
                  <th>Выручка completed</th>
                  <th>Время</th>
                </tr>
              </thead>
              <tbody>
                {topServiceMetrics.map((service) => (
                  <tr key={service.serviceId}>
                    <td>{service.title}</td>
                    <td>{service.category}</td>
                    <td>{service.count}</td>
                    <td>{service.completedCount}</td>
                    <td>{formatPrice(service.revenueAll)}</td>
                    <td>{formatPrice(service.revenueCompleted)}</td>
                    <td>{formatHoursByMinutes(service.durationMinutesTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!topServiceMetrics.length && !isLoading ? (
            <p className="admin-inline-note">По услугам пока нет данных.</p>
          ) : null}
        </article>
      </section>

      <section className="admin-block">
        <article className="admin-card admin-card--latest">
          <div className="admin-card__head">
            <h2>Ближайшие записи</h2>
            <span>нажмите на запись для деталей</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--recent-bookings">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Время</th>
                  <th>Клиент</th>
                  <th>Процедура</th>
                  <th>Цена</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {nearestBookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="admin-table-row-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openBookingDetails(booking)}
                    onKeyDown={(event) => handleUpcomingRowKeyDown(event, booking)}
                  >
                    <td>{formatBookingDateShort(booking.starts_at)}</td>
                    <td>{formatBookingTime(booking.starts_at)}</td>
                    <td>{getClientName(booking)}</td>
                    <td>{booking.service.title}</td>
                    <td>{formatPrice(booking.service.price)}</td>
                    <td>
                      <span className="admin-status">{bookingStatusLabel[booking.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!nearestBookings.length && !isLoading ? (
            <p className="admin-inline-note">Ближайших записей нет.</p>
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

export default SpecialistDashboardPage
