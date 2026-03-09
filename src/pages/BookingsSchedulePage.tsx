import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  createAdminBooking,
  fetchAdminBookings,
  fetchAdminSpecialistHours,
  fetchAdminServices,
  getStoredAdminToken,
  updateAdminBooking,
  type AdminBooking,
  type AdminHourSlot,
  type AdminService,
  type AuthUser,
  type CreateAdminBookingPayload,
  type UpdateAdminBookingPayload,
} from '../api/backend-api'
import { formatBookingTime } from '../lib/admin-format'
import AdminModal from '../components/AdminModal'
import { ArrowLeftIcon, ArrowRightIcon } from '../components/icons'
import BookingDetailsModal from '../components/BookingDetailsModal'

type WeekDayColumn = {
  date: Date
  key: string
  shortLabel: string
  dateLabel: string
}

type BookingsSchedulePageProps = {
  currentUser: AuthUser
}

type CreateBookingDraft = {
  bookingDate: string
  bookingTime: string
  bookingCategoryId: string
  fullName: string
  email: string
  phone: string
  serviceId: string
  comment: string
}

const WEEK_SLOT_STEP_MINUTES = 15
const DEFAULT_DAY_START_MINUTES = 8 * 60
const DEFAULT_DAY_END_MINUTES = 21 * 60

const weekDayFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
const dayDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' })
const weekRangeFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const selectedDayFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const slotDateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const emptyCreateBookingDraft: CreateBookingDraft = {
  bookingDate: '',
  bookingTime: '',
  bookingCategoryId: '',
  fullName: '',
  email: '',
  phone: '',
  serviceId: '',
  comment: '',
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'Ошибка при загрузке расписания.'
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

const toDateKey = (value: Date): string => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toTimeKeyFromMinutes = (minutes: number): string => {
  const hours = `${Math.floor(minutes / 60)}`.padStart(2, '0')
  const mins = `${minutes % 60}`.padStart(2, '0')
  return `${hours}:${mins}`
}

const alignMinutesToSlot = (minutes: number): number =>
  Math.floor(minutes / WEEK_SLOT_STEP_MINUTES) * WEEK_SLOT_STEP_MINUTES

const getMinutesOfDay = (value: Date): number => value.getHours() * 60 + value.getMinutes()

const formatTimeFromMinutes = (minutes: number): string =>
  `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}`

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

const getDayOfWeekIndex = (value: Date): number => (value.getDay() + 6) % 7

const buildWorkingIntervalsByDay = (
  slots: AdminHourSlot[],
): Map<number, Array<{ open: number; close: number }>> => {
  const byDay = new Map<number, Array<{ open: number; close: number }>>()

  for (let day = 0; day < 7; day += 1) {
    byDay.set(day, [])
  }

  const grouped = new Map<number, AdminHourSlot[]>()
  slots.forEach((slot) => {
    const current = grouped.get(slot.day_of_week) ?? []
    current.push(slot)
    grouped.set(slot.day_of_week, current)
  })

  grouped.forEach((daySlots, dayOfWeek) => {
    if (daySlots.some((slot) => slot.is_closed)) {
      byDay.set(dayOfWeek, [])
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
      .filter((value): value is { open: number; close: number } => Boolean(value))
      .sort((left, right) => left.open - right.open || left.close - right.close)

    byDay.set(dayOfWeek, intervals)
  })

  return byDay
}

const getBookingRowSpan = (booking: AdminBooking): number => {
  const startsMinutes = getMinutesOfDay(new Date(booking.starts_at))
  const endsMinutes = getMinutesOfDay(new Date(booking.ends_at))
  const duration = Math.max(WEEK_SLOT_STEP_MINUTES, endsMinutes - startsMinutes)
  return Math.max(1, Math.ceil(duration / WEEK_SLOT_STEP_MINUTES))
}

const startOfWeekMonday = (value: Date): Date => {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  return date
}

const addDays = (value: Date, days: number): Date => {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

const buildSlotDate = (dayKey: string, minutes: number): Date => {
  const [year, month, day] = dayKey.split('-').map(Number)
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  date.setMinutes(minutes)
  return date
}

const buildSlotDateFromDraft = (
  bookingDate: string,
  bookingTime: string,
): Date | null => {
  if (!bookingDate || !bookingTime) {
    return null
  }
  const minutes = parseTimeToMinutes(bookingTime)
  if (minutes === null) {
    return null
  }
  return buildSlotDate(bookingDate, minutes)
}

function BookingsSchedulePage({ currentUser }: BookingsSchedulePageProps) {
  const [now, setNow] = useState<Date>(() => new Date())
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [services, setServices] = useState<AdminService[]>([])
  const [specialistHoursSlots, setSpecialistHoursSlots] = useState<AdminHourSlot[] | null>(
    null,
  )
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null)
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => toDateKey(new Date()))
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()))
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateBookingDraft>(emptyCreateBookingDraft)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSavingBooking, setIsSavingBooking] = useState(false)
  const [isCreatingBooking, setIsCreatingBooking] = useState(false)

  const loadBookings = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const baseRequests = [
        fetchAdminBookings(token),
        fetchAdminServices(token),
      ] as const
      const specialistHoursRequest =
        currentUser.role === 'specialist'
          ? fetchAdminSpecialistHours(token, currentUser.id)
          : Promise.resolve(null)

      const [nextBookings, nextServices, specialistHours] = await Promise.all([
        ...baseRequests,
        specialistHoursRequest,
      ])

      setBookings(nextBookings)
      setServices(
        nextServices
          .filter((service) => service.is_active)
          .sort((left, right) =>
            left.category.localeCompare(right.category) || left.title.localeCompare(right.title),
          ),
      )
      setSpecialistHoursSlots(specialistHours?.slots ?? null)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [currentUser.id, currentUser.role])

  useEffect(() => {
    void loadBookings()
  }, [loadBookings])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date())
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const sortedBookings = useMemo(() => bookings.slice().sort(sortBookingsByNewest), [bookings])
  const weekDays = useMemo<WeekDayColumn[]>(
    () =>
      Array.from({ length: 7 }, (_, dayIndex) => {
        const day = addDays(weekStart, dayIndex)
        const shortLabelRaw = weekDayFormatter.format(day)
        const shortLabel = shortLabelRaw.charAt(0).toUpperCase() + shortLabelRaw.slice(1)
        return {
          date: day,
          key: toDateKey(day),
          shortLabel,
          dateLabel: dayDateFormatter.format(day),
        }
      }),
    [weekStart],
  )

  const specialistWorkingIntervalsByDay = useMemo(
    () =>
      currentUser.role === 'specialist' && specialistHoursSlots
        ? buildWorkingIntervalsByDay(specialistHoursSlots)
        : null,
    [currentUser.role, specialistHoursSlots],
  )

  const visibleWeekDays = useMemo(() => {
    return weekDays
  }, [weekDays])

  useEffect(() => {
    const availableDayKeys = new Set(visibleWeekDays.map((day) => day.key))
    if (!availableDayKeys.has(selectedDayKey)) {
      setSelectedDayKey(visibleWeekDays[0]?.key ?? toDateKey(new Date()))
    }
  }, [selectedDayKey, visibleWeekDays])

  const weekDayKeys = useMemo(() => new Set(visibleWeekDays.map((day) => day.key)), [visibleWeekDays])
  const weekBookings = useMemo(
    () =>
      sortedBookings.filter((booking) => {
        const dateKey = toDateKey(new Date(booking.starts_at))
        return weekDayKeys.has(dateKey)
      }),
    [sortedBookings, weekDayKeys],
  )

  const [startMinutes, endMinutes] = useMemo(() => {
    if (specialistWorkingIntervalsByDay) {
      const intervals = Array.from(specialistWorkingIntervalsByDay.values()).flat()
      if (!intervals.length) {
        return [DEFAULT_DAY_START_MINUTES, DEFAULT_DAY_END_MINUTES] as const
      }

      const minOpen = Math.min(...intervals.map((interval) => interval.open))
      const maxClose = Math.max(...intervals.map((interval) => interval.close))
      return [
        Math.floor(minOpen / WEEK_SLOT_STEP_MINUTES) * WEEK_SLOT_STEP_MINUTES,
        Math.ceil(maxClose / WEEK_SLOT_STEP_MINUTES) * WEEK_SLOT_STEP_MINUTES,
      ] as const
    }

    if (!weekBookings.length) {
      return [DEFAULT_DAY_START_MINUTES, DEFAULT_DAY_END_MINUTES] as const
    }

    const starts = weekBookings.map((booking) => getMinutesOfDay(new Date(booking.starts_at)))
    const ends = weekBookings.map((booking) => getMinutesOfDay(new Date(booking.ends_at)))
    const minStart = Math.min(...starts)
    const maxEnd = Math.max(...ends)
    const boundedStart = Math.min(
      DEFAULT_DAY_START_MINUTES,
      Math.floor(minStart / WEEK_SLOT_STEP_MINUTES) * WEEK_SLOT_STEP_MINUTES,
    )
    const boundedEnd = Math.max(
      DEFAULT_DAY_END_MINUTES,
      Math.ceil(maxEnd / WEEK_SLOT_STEP_MINUTES) * WEEK_SLOT_STEP_MINUTES,
    )
    return [boundedStart, boundedEnd] as const
  }, [specialistWorkingIntervalsByDay, weekBookings])

  const slotMinutes = useMemo(() => {
    const slots: number[] = []
    const lastStartMinutes = Math.max(startMinutes, endMinutes - WEEK_SLOT_STEP_MINUTES)
    for (
      let minutes = startMinutes;
      minutes <= lastStartMinutes;
      minutes += WEEK_SLOT_STEP_MINUTES
    ) {
      slots.push(minutes)
    }
    return slots
  }, [endMinutes, startMinutes])

  const bookingsByDayAndTime = useMemo(() => {
    const map = new Map<string, AdminBooking[]>()
    weekBookings.forEach((booking) => {
      const startsAt = new Date(booking.starts_at)
      const alignedStartsMinutes = alignMinutesToSlot(getMinutesOfDay(startsAt))
      const key = `${toDateKey(startsAt)}|${toTimeKeyFromMinutes(alignedStartsMinutes)}`
      const current = map.get(key)
      if (current) {
        current.push(booking)
      } else {
        map.set(key, [booking])
      }
    })

    map.forEach((list) => {
      list.sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at))
    })
    return map
  }, [weekBookings])

  const mobileSelectedDay = useMemo(
    () =>
      visibleWeekDays.find((day) => day.key === selectedDayKey) ??
      visibleWeekDays[0] ??
      null,
    [selectedDayKey, visibleWeekDays],
  )

  const weekRangeLabel = useMemo(() => {
    const from = weekDays[0]?.date
    const to = weekDays[6]?.date
    if (!from || !to) {
      return ''
    }
    return `${weekRangeFormatter.format(from)} — ${weekRangeFormatter.format(to)}`
  }, [weekDays])

  const currentTimeRowMinutes = useMemo(() => {
    if (!slotMinutes.length) {
      return null
    }

    const todayKey = toDateKey(now)
    const hasTodayInView = visibleWeekDays.some((day) => day.key === todayKey)
    if (!hasTodayInView) {
      return null
    }

    const snappedMinutes = alignMinutesToSlot(getMinutesOfDay(now))
    const firstRowMinutes = slotMinutes[0]
    const lastRowMinutes = slotMinutes[slotMinutes.length - 1]

    if (snappedMinutes < firstRowMinutes || snappedMinutes > lastRowMinutes) {
      return null
    }

    return snappedMinutes
  }, [now, slotMinutes, visibleWeekDays])

  const isSlotAvailableForDay = useCallback(
    (dayDate: Date, minutes: number) => {
      if (!specialistWorkingIntervalsByDay) {
        return true
      }

      const dayIndex = getDayOfWeekIndex(dayDate)
      const intervals = specialistWorkingIntervalsByDay.get(dayIndex) ?? []
      return intervals.some((interval) => minutes >= interval.open && minutes < interval.close)
    },
    [specialistWorkingIntervalsByDay],
  )

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

  const shiftWeek = (offset: number) => {
    setWeekStart((currentWeekStart) => addDays(currentWeekStart, offset * 7))
  }

  const goToCurrentWeek = () => {
    const today = new Date()
    setWeekStart(startOfWeekMonday(today))
    setSelectedDayKey(toDateKey(today))
  }

  const categoryOptions = useMemo(
    () => {
      const seen = new Map<number, string>()
      for (const service of services) {
        if (!seen.has(service.category_id)) {
          seen.set(service.category_id, service.category)
        }
      }
      return Array.from(seen, ([id, name]) => ({ id, name })).sort((left, right) =>
        left.name.localeCompare(right.name),
      )
    },
    [services],
  )

  const filteredServiceOptions = useMemo(() => {
    const categoryId = Number(createForm.bookingCategoryId)
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return [] as AdminService[]
    }
    return services.filter((service) => service.category_id === categoryId)
  }, [createForm.bookingCategoryId, services])

  const openCreateModal = (dayKey: string, minutes: number) => {
    const defaultService = services[0] ?? null
    const defaultServiceId = defaultService ? String(defaultService.id) : ''
    const defaultCategoryId = defaultService ? String(defaultService.category_id) : ''
    setCreateForm((currentForm) => ({
      ...currentForm,
      serviceId: currentForm.serviceId || defaultServiceId,
      bookingCategoryId: currentForm.bookingCategoryId || defaultCategoryId,
      bookingDate: dayKey,
      bookingTime: formatTimeFromMinutes(minutes),
    }))
    setIsCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    if (isCreatingBooking) {
      return
    }
    setIsCreateModalOpen(false)
    setCreateForm(emptyCreateBookingDraft)
  }

  const selectedCreateSlotDate = useMemo(() => {
    return buildSlotDateFromDraft(createForm.bookingDate, createForm.bookingTime)
  }, [createForm.bookingDate, createForm.bookingTime])

  const handleCreateBooking = async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const fullName = createForm.fullName.trim()
    const email = createForm.email.trim()
    const phone = createForm.phone.trim()
    const comment = createForm.comment.trim()
    const categoryId = Number(createForm.bookingCategoryId)
    const serviceId = Number(createForm.serviceId)

    if (fullName.length < 2) {
      setError('Укажите имя клиента.')
      return
    }
    if (!email) {
      setError('Укажите email клиента.')
      return
    }
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setError('Выберите категорию.')
      return
    }
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      setError('Выберите процедуру.')
      return
    }
    const selectedService = services.find(
      (service) =>
        service.id === serviceId &&
        service.category_id === categoryId &&
        service.is_active,
    )
    if (!selectedService) {
      setError('Выберите процедуру из выбранной категории.')
      return
    }
    const startsAtDate = buildSlotDateFromDraft(
      createForm.bookingDate,
      createForm.bookingTime,
    )
    if (!startsAtDate) {
      setError('Выберите дату и время записи.')
      return
    }
    const bookingMinutes = parseTimeToMinutes(createForm.bookingTime)
    if (
      bookingMinutes === null ||
      bookingMinutes % WEEK_SLOT_STEP_MINUTES !== 0
    ) {
      setError('Время записи должно быть с шагом 15 минут.')
      return
    }

    const startsAt = startsAtDate.toISOString()
    const payload: CreateAdminBookingPayload = {
      full_name: fullName,
      email,
      phone: phone || null,
      service_id: selectedService.id,
      specialist_name: null,
      starts_at: startsAt,
      comment: comment || null,
    }

    setIsCreatingBooking(true)
    setError(null)

    try {
      const createdBooking = await createAdminBooking(token, payload)
      setBookings((currentBookings) =>
        [createdBooking, ...currentBookings].sort(sortBookingsByNewest),
      )
      setIsCreateModalOpen(false)
      setCreateForm(emptyCreateBookingDraft)
      setSelectedBooking(createdBooking)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsCreatingBooking(false)
    }
  }

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Календарь</h1>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card admin-card--latest">
        <div className="admin-card__head">
          <h2>{weekRangeLabel}</h2>
          <div className="admin-actions-cell">
            <button
              className="admin-week-nav-btn"
              type="button"
              aria-label="Предыдущая неделя"
              onClick={() => shiftWeek(-1)}
            >
              <ArrowLeftIcon size={18} aria-hidden="true" />
            </button>
            <button className="admin-inline-btn" type="button" onClick={goToCurrentWeek}>
              Текущая
            </button>
            <button
              className="admin-week-nav-btn"
              type="button"
              aria-label="Следующая неделя"
              onClick={() => shiftWeek(1)}
            >
              <ArrowRightIcon size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="admin-week-planner admin-week-planner--desktop">
          <div className="admin-week-table-wrap">
            <table className="admin-table admin-week-table">
              <thead>
                <tr>
                  <th aria-label="Время" />
                  {visibleWeekDays.map((day) => (
                    <th key={day.key}>
                      <div className="admin-week-day-head">
                        <strong>{day.shortLabel}</strong>
                        <span>{day.dateLabel}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slotMinutes.map((minutes, slotIndex) => {
                  const slotTimeKey = toTimeKeyFromMinutes(minutes)
                  const isCurrentTimeRow = currentTimeRowMinutes === minutes
                  return (
                    <tr
                      key={slotTimeKey}
                      className={isCurrentTimeRow ? 'admin-week-row is-current-time' : 'admin-week-row'}
                    >
                      <th>{formatTimeFromMinutes(minutes)}</th>
                      {visibleWeekDays.map((day) => {
                        const mapKey = `${day.key}|${slotTimeKey}`
                        const slotBookings = bookingsByDayAndTime.get(mapKey) ?? []
                        const slotDateTime = buildSlotDate(day.key, minutes)
                        const isSlotPast = slotDateTime.getTime() < now.getTime()
                        const isSlotAvailable =
                          isSlotAvailableForDay(day.date, minutes) && !isSlotPast
                        const isSlotAddable =
                          currentUser.role === 'specialist' || isSlotAvailable
                        return (
                          <td
                            key={`${mapKey}-cell`}
                            className="admin-week-cell-wrap"
                            data-has-bookings={slotBookings.length > 0}
                            data-slot-available={isSlotAvailable}
                            data-slot-addable={isSlotAddable}
                            data-slot-past={isSlotPast}
                            style={{ '--slot-index': slotIndex } as CSSProperties}
                          >
                            <div className="admin-week-cell">
                              <button
                                className="admin-week-add-btn"
                                type="button"
                                aria-label={`Добавить запись ${day.dateLabel} ${formatTimeFromMinutes(minutes)}`}
                                disabled={!isSlotAddable}
                                onClick={() => openCreateModal(day.key, minutes)}
                              >
                                <span>{formatTimeFromMinutes(minutes)}</span>
                              </button>
                              {slotBookings.length ? slotBookings.map((booking, bookingIndex) => {
                                const bookingComment = (booking.comment ?? '').trim()
                                return (
                                  <button
                                    key={booking.id}
                                    className={`admin-week-booking admin-week-booking--${booking.status}`}
                                    type="button"
                                    style={
                                      {
                                        '--booking-span': getBookingRowSpan(booking),
                                        '--stack-index': bookingIndex,
                                      } as CSSProperties
                                    }
                                    onClick={() => setSelectedBooking(booking)}
                                  >
                                    <strong>{getClientName(booking)}</strong>
                                    <span>{booking.service.title}</span>
                                    {bookingComment ? (
                                      <p className="admin-week-booking__comment">{bookingComment}</p>
                                    ) : null}
                                    <small>
                                      {formatBookingTime(booking.starts_at)} — {formatBookingTime(booking.ends_at)}
                                    </small>
                                  </button>
                                )
                              }) : (
                                <div className="admin-week-cell--empty" />
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-week-planner admin-week-planner--mobile">
          <div className="admin-week-mobile-days">
            {visibleWeekDays.map((day) => (
              <button
                key={day.key}
                type="button"
                className="admin-week-mobile-day"
                data-active={mobileSelectedDay?.key === day.key}
                onClick={() => setSelectedDayKey(day.key)}
              >
                <strong>{day.shortLabel}</strong>
                <span>{day.dateLabel}</span>
              </button>
            ))}
          </div>

          {mobileSelectedDay ? (
            <p className="admin-week-mobile-selected">
              {selectedDayFormatter.format(mobileSelectedDay.date)}
            </p>
          ) : null}

          <div className="admin-week-mobile-table-wrap">
            <table className="admin-table admin-week-mobile-table">
              <thead>
                <tr>
                  <th aria-label="Время" />
                  <th>Записи</th>
                </tr>
              </thead>
              <tbody>
                {slotMinutes.map((minutes, slotIndex) => {
                  const slotTimeKey = toTimeKeyFromMinutes(minutes)
                  const dayKey = mobileSelectedDay?.key ?? ''
                  const mapKey = `${dayKey}|${slotTimeKey}`
                  const slotBookings = bookingsByDayAndTime.get(mapKey) ?? []
                  const isCurrentTimeRow = currentTimeRowMinutes === minutes
                  const slotDateTime =
                    mobileSelectedDay
                      ? buildSlotDate(mobileSelectedDay.key, minutes)
                      : null
                  const isSlotPast =
                    slotDateTime !== null
                      ? slotDateTime.getTime() < now.getTime()
                      : false
                  const isSlotAvailable =
                    mobileSelectedDay
                      ? isSlotAvailableForDay(mobileSelectedDay.date, minutes) && !isSlotPast
                      : false
                  const isSlotAddable =
                    currentUser.role === 'specialist' || isSlotAvailable
                  return (
                    <tr
                      key={`mobile-${slotTimeKey}`}
                      className={isCurrentTimeRow ? 'admin-week-row is-current-time' : 'admin-week-row'}
                    >
                      <th>{formatTimeFromMinutes(minutes)}</th>
                      <td
                        className="admin-week-cell-wrap"
                        data-has-bookings={slotBookings.length > 0}
                        data-slot-available={isSlotAvailable}
                        data-slot-addable={isSlotAddable}
                        data-slot-past={isSlotPast}
                        style={{ '--slot-index': slotIndex } as CSSProperties}
                      >
                        <div className="admin-week-cell">
                          <button
                            className="admin-week-add-btn"
                            type="button"
                            aria-label={`Добавить запись ${mobileSelectedDay?.dateLabel ?? ''} ${formatTimeFromMinutes(minutes)}`}
                            disabled={!mobileSelectedDay || !isSlotAddable}
                            onClick={() => {
                              if (mobileSelectedDay) {
                                openCreateModal(mobileSelectedDay.key, minutes)
                              }
                            }}
                          >
                            <span>{formatTimeFromMinutes(minutes)}</span>
                          </button>
                          {slotBookings.length ? slotBookings.map((booking, bookingIndex) => {
                            const bookingComment = (booking.comment ?? '').trim()
                            return (
                              <button
                                key={`mobile-${booking.id}`}
                                className={`admin-week-booking admin-week-booking--${booking.status}`}
                                type="button"
                                style={
                                  {
                                    '--booking-span': getBookingRowSpan(booking),
                                    '--stack-index': bookingIndex,
                                  } as CSSProperties
                                }
                                onClick={() => setSelectedBooking(booking)}
                              >
                                <strong>{getClientName(booking)}</strong>
                                <span>{booking.service.title}</span>
                                {bookingComment ? (
                                  <p className="admin-week-booking__comment">{bookingComment}</p>
                                ) : null}
                                <small>
                                  {formatBookingTime(booking.starts_at)} — {formatBookingTime(booking.ends_at)}
                                </small>
                              </button>
                            )
                          }) : (
                            <div className="admin-week-cell--empty" />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!weekBookings.length && !isLoading ? (
          <p className="admin-inline-note">На выбранной неделе записей нет.</p>
        ) : null}
        {specialistWorkingIntervalsByDay && !visibleWeekDays.length && !isLoading ? (
          <p className="admin-inline-note">В вашем графике нет рабочих дней на этой неделе.</p>
        ) : null}
      </article>

      <BookingDetailsModal
        booking={selectedBooking}
        isSaving={isSavingBooking}
        onSave={handleBookingSave}
        onClose={() => setSelectedBooking(null)}
      />

      <AdminModal
        open={isCreateModalOpen}
        title="Новая запись в слот"
        onClose={closeCreateModal}
        footer={(
          <>
            <button className="admin-inline-btn" type="button" onClick={closeCreateModal} disabled={isCreatingBooking}>
              Отмена
            </button>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              onClick={() => void handleCreateBooking()}
              disabled={
                isCreatingBooking ||
                !services.length ||
                !createForm.bookingCategoryId ||
                !createForm.bookingDate ||
                !createForm.bookingTime
              }
            >
              {isCreatingBooking ? 'Создаем...' : 'Создать запись'}
            </button>
          </>
        )}
      >
        <form
          className="admin-service-form admin-create-booking-form"
          onSubmit={(event) => {
            event.preventDefault()
            void handleCreateBooking()
          }}
        >
          <p className="admin-inline-note">
            {selectedCreateSlotDate
              ? `Слот: ${slotDateTimeFormatter.format(selectedCreateSlotDate)}`
              : 'Слот не выбран'}
          </p>

          <div className="admin-service-form__row">
            <input
              type="date"
              value={createForm.bookingDate}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCreateForm((currentForm) => ({ ...currentForm, bookingDate: value }))
              }}
              required
            />
            <input
              type="time"
              step={WEEK_SLOT_STEP_MINUTES * 60}
              value={createForm.bookingTime}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCreateForm((currentForm) => ({ ...currentForm, bookingTime: value }))
              }}
              required
            />
          </div>

          <input
            type="text"
            placeholder="Имя и фамилия клиента"
            value={createForm.fullName}
            onChange={(event) => {
              const value = event.currentTarget.value
              setCreateForm((currentForm) => ({ ...currentForm, fullName: value }))
            }}
            required
          />
          <input
            type="email"
            placeholder="Email клиента"
            value={createForm.email}
            onChange={(event) => {
              const value = event.currentTarget.value
              setCreateForm((currentForm) => ({ ...currentForm, email: value }))
            }}
            required
          />
          <input
            type="tel"
            placeholder="Телефон (опционально)"
            value={createForm.phone}
            onChange={(event) => {
              const value = event.currentTarget.value
              setCreateForm((currentForm) => ({ ...currentForm, phone: value }))
            }}
          />
          <select
            value={createForm.bookingCategoryId}
            onChange={(event) => {
              const value = event.currentTarget.value
              const categoryId = Number(value)
              const firstServiceInCategory = services.find(
                (service) => service.category_id === categoryId,
              )
              setCreateForm((currentForm) => ({
                ...currentForm,
                bookingCategoryId: value,
                serviceId: firstServiceInCategory ? String(firstServiceInCategory.id) : '',
              }))
            }}
            required
            disabled={!categoryOptions.length}
          >
            {!categoryOptions.length ? (
              <option value="">Нет категорий</option>
            ) : (
              <option value="">Выберите категорию</option>
            )}
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            value={createForm.serviceId}
            onChange={(event) => {
              const value = event.currentTarget.value
              setCreateForm((currentForm) => ({ ...currentForm, serviceId: value }))
            }}
            required
            disabled={!filteredServiceOptions.length}
          >
            {!filteredServiceOptions.length ? (
              <option value="">Нет услуг в категории</option>
            ) : null}
            {filteredServiceOptions.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title} · {service.duration_minutes} мин
              </option>
            ))}
          </select>
          <textarea
            rows={3}
            placeholder="Комментарий (опционально)"
            value={createForm.comment}
            onChange={(event) => {
              const value = event.currentTarget.value
              setCreateForm((currentForm) => ({ ...currentForm, comment: value }))
            }}
          />
        </form>
      </AdminModal>
    </section>
  )
}

export default BookingsSchedulePage
