import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchAdminSpecialistHours,
  getStoredAdminToken,
  updateAdminSpecialistHours,
  type AdminHourSlot,
  type AuthUser,
} from '../api/backend-api'
import AdminModal from '../components/AdminModal'

const dayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DEFAULT_OPEN_TIME = '09:00'
const DEFAULT_CLOSE_TIME = '20:00'

type TimeIntervalDraft = {
  open_time: string
  close_time: string
}

type DayHoursDraft = {
  day_of_week: number
  is_closed: boolean
  intervals: TimeIntervalDraft[]
}

type SpecialistHoursPageProps = {
  currentUser: AuthUser
}

const defaultDayDrafts = (): DayHoursDraft[] =>
  dayLabels.map((_, index) => ({
    day_of_week: index,
    is_closed: false,
    intervals: [{ open_time: DEFAULT_OPEN_TIME, close_time: DEFAULT_CLOSE_TIME }],
  }))

const normalizeTime = (value: string | null): string => {
  if (!value) {
    return ''
  }
  return value.slice(0, 5)
}

const parseTimeToMinutes = (value: string): number | null => {
  const [hoursRaw, minutesRaw] = value.split(':')
  const hours = Number.parseInt(hoursRaw, 10)
  const minutes = Number.parseInt(minutesRaw, 10)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }
  return hours * 60 + minutes
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Ошибка при обновлении графика.'
}

const cloneDayDrafts = (days: DayHoursDraft[]): DayHoursDraft[] =>
  days.map((day) => ({
    day_of_week: day.day_of_week,
    is_closed: day.is_closed,
    intervals: day.intervals.map((interval) => ({
      open_time: interval.open_time,
      close_time: interval.close_time,
    })),
  }))

const fromSlotsToDayDrafts = (slots: AdminHourSlot[]): DayHoursDraft[] => {
  const grouped = new Map<number, AdminHourSlot[]>()
  slots
    .slice()
    .sort(
      (a, b) =>
        a.day_of_week - b.day_of_week || a.interval_index - b.interval_index,
    )
    .forEach((slot) => {
      const current = grouped.get(slot.day_of_week) ?? []
      current.push(slot)
      grouped.set(slot.day_of_week, current)
    })

  return dayLabels.map((_, dayOfWeek) => {
    const daySlots = grouped.get(dayOfWeek) ?? []
    if (!daySlots.length) {
      return {
        day_of_week: dayOfWeek,
        is_closed: false,
        intervals: [{ open_time: DEFAULT_OPEN_TIME, close_time: DEFAULT_CLOSE_TIME }],
      }
    }

    const hasClosed = daySlots.some((slot) => slot.is_closed)
    if (hasClosed) {
      return {
        day_of_week: dayOfWeek,
        is_closed: true,
        intervals: [{ open_time: DEFAULT_OPEN_TIME, close_time: DEFAULT_CLOSE_TIME }],
      }
    }

    const intervals = daySlots
      .map((slot) => ({
        open_time: normalizeTime(slot.open_time),
        close_time: normalizeTime(slot.close_time),
      }))
      .filter((interval) => interval.open_time && interval.close_time)

    return {
      day_of_week: dayOfWeek,
      is_closed: false,
      intervals:
        intervals.length > 0
          ? intervals
          : [{ open_time: DEFAULT_OPEN_TIME, close_time: DEFAULT_CLOSE_TIME }],
    }
  })
}

const toPayloadSlots = (days: DayHoursDraft[]): AdminHourSlot[] => {
  const sortedDays = days
    .slice()
    .sort((a, b) => a.day_of_week - b.day_of_week)
  const payload: AdminHourSlot[] = []

  sortedDays.forEach((day) => {
    if (day.is_closed) {
      payload.push({
        day_of_week: day.day_of_week,
        interval_index: 0,
        is_closed: true,
        open_time: null,
        close_time: null,
      })
      return
    }

    const normalizedIntervals = day.intervals.length
      ? day.intervals
      : [{ open_time: DEFAULT_OPEN_TIME, close_time: DEFAULT_CLOSE_TIME }]

    normalizedIntervals.forEach((interval, intervalIndex) => {
      payload.push({
        day_of_week: day.day_of_week,
        interval_index: intervalIndex,
        is_closed: false,
        open_time: interval.open_time || null,
        close_time: interval.close_time || null,
      })
    })
  })

  return payload
}

const formatIntervals = (day: DayHoursDraft): string => {
  if (day.is_closed) {
    return '—'
  }

  return day.intervals
    .map((interval) => {
      const open = interval.open_time || '--:--'
      const close = interval.close_time || '--:--'
      return `${open} - ${close}`
    })
    .join(', ')
}

const validateDayDrafts = (days: DayHoursDraft[]): string | null => {
  for (const day of days) {
    if (day.is_closed) {
      continue
    }

    if (!day.intervals.length) {
      return `Добавьте хотя бы один интервал для ${dayLabels[day.day_of_week]}`
    }

    const normalized: Array<{ open: number; close: number }> = []
    for (const interval of day.intervals) {
      const openMinutes = parseTimeToMinutes(interval.open_time)
      const closeMinutes = parseTimeToMinutes(interval.close_time)
      if (openMinutes === null || closeMinutes === null) {
        return `Заполните время для ${dayLabels[day.day_of_week]}`
      }
      if (openMinutes >= closeMinutes) {
        return `Время "с" должно быть меньше "до" для ${dayLabels[day.day_of_week]}`
      }
      normalized.push({ open: openMinutes, close: closeMinutes })
    }

    normalized.sort((a, b) => a.open - b.open || a.close - b.close)
    for (let index = 1; index < normalized.length; index += 1) {
      if (normalized[index].open < normalized[index - 1].close) {
        return `Интервалы пересекаются в ${dayLabels[day.day_of_week]}`
      }
    }
  }

  return null
}

const updateDayDraft = (
  days: DayHoursDraft[],
  dayOfWeek: number,
  updater: (day: DayHoursDraft) => DayHoursDraft,
): DayHoursDraft[] =>
  days.map((day) => (day.day_of_week === dayOfWeek ? updater(day) : day))

const updateIntervalDraft = (
  days: DayHoursDraft[],
  dayOfWeek: number,
  intervalIndex: number,
  patch: Partial<TimeIntervalDraft>,
): DayHoursDraft[] =>
  updateDayDraft(days, dayOfWeek, (day) => ({
    ...day,
    intervals: day.intervals.map((interval, index) =>
      index === intervalIndex ? { ...interval, ...patch } : interval,
    ),
  }))

const addDayInterval = (days: DayHoursDraft[], dayOfWeek: number): DayHoursDraft[] =>
  updateDayDraft(days, dayOfWeek, (day) => ({
    ...day,
    intervals: [
      ...day.intervals,
      {
        open_time: DEFAULT_OPEN_TIME,
        close_time: DEFAULT_CLOSE_TIME,
      },
    ],
  }))

const removeDayInterval = (
  days: DayHoursDraft[],
  dayOfWeek: number,
  intervalIndex: number,
): DayHoursDraft[] =>
  updateDayDraft(days, dayOfWeek, (day) => ({
    ...day,
    intervals:
      day.intervals.length > 1
        ? day.intervals.filter((_, index) => index !== intervalIndex)
        : day.intervals,
  }))

function SpecialistHoursPage({ currentUser }: SpecialistHoursPageProps) {
  const [hours, setHours] = useState<DayHoursDraft[]>(defaultDayDrafts)
  const [hoursDraft, setHoursDraft] = useState<DayHoursDraft[]>(defaultDayDrafts)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadHours = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const payload = await fetchAdminSpecialistHours(token, currentUser.id)
      const next = fromSlotsToDayDrafts(payload.slots)
      setHours(next)
      setHoursDraft(cloneDayDrafts(next))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    void loadHours()
  }, [loadHours])

  const summary = useMemo(
    () => `${hours.filter((day) => !day.is_closed).length} рабочих дней в неделю`,
    [hours],
  )

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const validationMessage = validateDayDrafts(hoursDraft)
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await updateAdminSpecialistHours(token, currentUser.id, {
        slots: toPayloadSlots(hoursDraft),
      })
      const normalized = fromSlotsToDayDrafts(updated.slots)
      setHours(normalized)
      setHoursDraft(cloneDayDrafts(normalized))
      setIsModalOpen(false)
      setSuccess('График сохранен.')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Мой график</h1>
        <p>Часы работы, которые используются в календаре записи.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}
      {success ? <p className="admin-inline-note">{success}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Расписание специалиста</h2>
          <div className="admin-actions-cell">
            <span>{summary}</span>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              onClick={() => {
                setHoursDraft(cloneDayDrafts(hours))
                setIsModalOpen(true)
              }}
            >
              Редактировать
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>День</th>
                <th>Интервалы</th>
                <th>Выходной</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((day) => (
                <tr key={day.day_of_week}>
                  <td>{dayLabels[day.day_of_week]}</td>
                  <td>{formatIntervals(day)}</td>
                  <td>{day.is_closed ? 'Да' : 'Нет'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isLoading ? <p className="admin-inline-note">Загружаем график...</p> : null}
      </article>

      <AdminModal
        open={isModalOpen}
        title="Редактирование моего графика"
        onClose={() => {
          if (isSaving) {
            return
          }
          setIsModalOpen(false)
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSave(event)}>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>День</th>
                  <th>Интервалы</th>
                  <th>Выходной</th>
                </tr>
              </thead>
              <tbody>
                {hoursDraft.map((day) => (
                  <tr key={day.day_of_week}>
                    <td>{dayLabels[day.day_of_week]}</td>
                    <td>
                      <div className="admin-hours-stack">
                        {day.intervals.map((interval, index) => (
                          <div className="admin-hours-row" key={`${day.day_of_week}-${index}`}>
                            <input
                              className="admin-inline-input"
                              type="time"
                              value={interval.open_time}
                              disabled={day.is_closed}
                              onChange={(event) => {
                                const value = event.currentTarget.value
                                setHoursDraft((current) =>
                                  updateIntervalDraft(current, day.day_of_week, index, {
                                    open_time: value,
                                  }),
                                )
                              }}
                            />
                            <span className="admin-hours-sep">—</span>
                            <input
                              className="admin-inline-input"
                              type="time"
                              value={interval.close_time}
                              disabled={day.is_closed}
                              onChange={(event) => {
                                const value = event.currentTarget.value
                                setHoursDraft((current) =>
                                  updateIntervalDraft(current, day.day_of_week, index, {
                                    close_time: value,
                                  }),
                                )
                              }}
                            />
                            <button
                              className="admin-inline-btn"
                              type="button"
                              disabled={day.is_closed || day.intervals.length <= 1}
                              onClick={() => {
                                setHoursDraft((current) =>
                                  removeDayInterval(current, day.day_of_week, index),
                                )
                              }}
                            >
                              −
                            </button>
                          </div>
                        ))}
                        <div className="admin-hours-actions">
                          <button
                            className="admin-inline-btn"
                            type="button"
                            disabled={day.is_closed}
                            onClick={() => {
                              setHoursDraft((current) =>
                                addDayInterval(current, day.day_of_week),
                              )
                            }}
                          >
                            + Интервал
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <label className="admin-check-field">
                        <input
                          type="checkbox"
                          checked={day.is_closed}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked
                            setHoursDraft((current) =>
                              updateDayDraft(current, day.day_of_week, (prevDay) => ({
                                ...prevDay,
                                is_closed: checked,
                              })),
                            )
                          }}
                        />
                        <span>{day.is_closed ? 'Да' : 'Нет'}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Сохраняем...' : 'Сохранить график'}
          </button>
        </form>
      </AdminModal>
    </section>
  )
}

export default SpecialistHoursPage
