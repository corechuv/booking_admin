import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchAdminContact,
  fetchAdminGeneralHours,
  fetchAdminSpecialistHours,
  fetchAdminSpecialists,
  getStoredAdminToken,
  updateAdminContact,
  updateAdminGeneralHours,
  updateAdminSpecialistHours,
  type AdminContactSettings,
  type AdminHourSlot,
  type AdminSpecialist,
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
  return 'Ошибка при работе с контактами и расписанием.'
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

function ContactsPage() {
  const [contact, setContact] = useState<AdminContactSettings | null>(null)
  const [contactDraft, setContactDraft] = useState<AdminContactSettings | null>(null)

  const [generalDays, setGeneralDays] = useState<DayHoursDraft[]>(defaultDayDrafts)
  const [generalDaysDraft, setGeneralDaysDraft] = useState<DayHoursDraft[]>(defaultDayDrafts)

  const [specialists, setSpecialists] = useState<AdminSpecialist[]>([])
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<number | null>(null)
  const [specialistDays, setSpecialistDays] = useState<DayHoursDraft[]>(defaultDayDrafts)
  const [specialistDaysDraft, setSpecialistDaysDraft] = useState<DayHoursDraft[]>(defaultDayDrafts)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [isSavingGeneral, setIsSavingGeneral] = useState(false)
  const [isSavingSpecialist, setIsSavingSpecialist] = useState(false)

  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [isGeneralModalOpen, setIsGeneralModalOpen] = useState(false)
  const [isSpecialistModalOpen, setIsSpecialistModalOpen] = useState(false)

  const loadInitial = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const [nextContact, generalHours, nextSpecialists] = await Promise.all([
        fetchAdminContact(token),
        fetchAdminGeneralHours(token),
        fetchAdminSpecialists(token),
      ])

      const nextGeneralDays = fromSlotsToDayDrafts(generalHours.slots)
      setContact(nextContact)
      setContactDraft(nextContact)
      setGeneralDays(nextGeneralDays)
      setGeneralDaysDraft(cloneDayDrafts(nextGeneralDays))
      setSpecialists(nextSpecialists)
      setSelectedSpecialistId(nextSpecialists.length ? nextSpecialists[0].id : null)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    const specialistId = selectedSpecialistId
    if (!specialistId) {
      setSpecialistDays(defaultDayDrafts)
      setSpecialistDaysDraft(defaultDayDrafts)
      return
    }

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const loadSpecialistHours = async () => {
      setError(null)
      try {
        const specialistHours = await fetchAdminSpecialistHours(token, specialistId)
        const nextDays = fromSlotsToDayDrafts(specialistHours.slots)
        setSpecialistDays(nextDays)
        setSpecialistDaysDraft(cloneDayDrafts(nextDays))
      } catch (requestError) {
        setError(getErrorMessage(requestError))
      }
    }

    void loadSpecialistHours()
  }, [selectedSpecialistId])

  const selectedSpecialist = useMemo(
    () => specialists.find((item) => item.id === selectedSpecialistId) ?? null,
    [selectedSpecialistId, specialists],
  )

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

  const handleSaveContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token || !contactDraft) {
      return
    }

    setIsSavingContact(true)
    setError(null)
    try {
      const updated = await updateAdminContact(token, {
        salon_name: contactDraft.salon_name,
        phone: contactDraft.phone,
        email: contactDraft.email,
        address: contactDraft.address,
        route_url: contactDraft.route_url,
      })
      setContact(updated)
      setContactDraft(updated)
      setIsContactModalOpen(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingContact(false)
    }
  }

  const handleSaveGeneralHours = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const validationMessage = validateDayDrafts(generalDaysDraft)
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setIsSavingGeneral(true)
    setError(null)
    try {
      const updated = await updateAdminGeneralHours(token, {
        slots: toPayloadSlots(generalDaysDraft),
      })
      const normalized = fromSlotsToDayDrafts(updated.slots)
      setGeneralDays(normalized)
      setGeneralDaysDraft(cloneDayDrafts(normalized))
      setIsGeneralModalOpen(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingGeneral(false)
    }
  }

  const handleSaveSpecialistHours = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token || !selectedSpecialistId) {
      return
    }

    const validationMessage = validateDayDrafts(specialistDaysDraft)
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setIsSavingSpecialist(true)
    setError(null)
    try {
      const updated = await updateAdminSpecialistHours(token, selectedSpecialistId, {
        slots: toPayloadSlots(specialistDaysDraft),
      })
      const normalized = fromSlotsToDayDrafts(updated.slots)
      setSpecialistDays(normalized)
      setSpecialistDaysDraft(cloneDayDrafts(normalized))
      setIsSpecialistModalOpen(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingSpecialist(false)
    }
  }

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Контакты и графики</h1>
        <p>Контакты салона, общий график и графики специалистов.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Контакты салона</h2>
          <button
            className="admin-inline-btn admin-inline-btn--accent"
            type="button"
            disabled={!contact}
            onClick={() => {
              if (!contact) {
                return
              }
              setContactDraft(contact)
              setIsContactModalOpen(true)
            }}
          >
            Редактировать
          </button>
        </div>

        {contact ? (
          <ul className="admin-content-list">
            <li>
              <strong>Название</strong>
              <b>{contact.salon_name}</b>
            </li>
            <li>
              <strong>Телефон</strong>
              <b>{contact.phone}</b>
            </li>
            <li>
              <strong>Email</strong>
              <b>{contact.email}</b>
            </li>
            <li>
              <strong>Адрес</strong>
              <b>{contact.address}</b>
            </li>
            <li>
              <strong>Маршрут</strong>
              <b>{contact.route_url}</b>
            </li>
          </ul>
        ) : null}
      </article>

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Общий график</h2>
          <button
            className="admin-inline-btn admin-inline-btn--accent"
            type="button"
            onClick={() => {
              setGeneralDaysDraft(cloneDayDrafts(generalDays))
              setIsGeneralModalOpen(true)
            }}
          >
            Редактировать
          </button>
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
              {generalDays.map((day) => (
                <tr key={day.day_of_week}>
                  <td>{dayLabels[day.day_of_week]}</td>
                  <td>{formatIntervals(day)}</td>
                  <td>{day.is_closed ? 'Да' : 'Нет'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>График специалистов</h2>
          <span>{selectedSpecialist ? selectedSpecialist.full_name : 'Выберите специалиста'}</span>
        </div>

        <div className="admin-page-actions">
          <select
            className="admin-status-select"
            value={selectedSpecialistId ?? ''}
            onChange={(event) =>
              setSelectedSpecialistId(Number.parseInt(event.currentTarget.value, 10) || null)
            }
          >
            {!specialists.length ? <option value="">Нет специалистов</option> : null}
            {specialists.map((specialist) => (
              <option key={specialist.id} value={specialist.id}>
                {specialist.full_name}
              </option>
            ))}
          </select>
          <button
            className="admin-inline-btn admin-inline-btn--accent"
            type="button"
            disabled={!selectedSpecialistId}
            onClick={() => {
              setSpecialistDaysDraft(cloneDayDrafts(specialistDays))
              setIsSpecialistModalOpen(true)
            }}
          >
            Редактировать
          </button>
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
              {specialistDays.map((day) => (
                <tr key={day.day_of_week}>
                  <td>{dayLabels[day.day_of_week]}</td>
                  <td>{formatIntervals(day)}</td>
                  <td>{day.is_closed ? 'Да' : 'Нет'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <AdminModal
        open={isContactModalOpen && contactDraft !== null}
        title="Редактирование контактов"
        onClose={() => {
          if (isSavingContact) {
            return
          }
          setIsContactModalOpen(false)
        }}
      >
        {contactDraft ? (
          <form className="admin-service-form" onSubmit={(event) => void handleSaveContact(event)}>
            <input
              type="text"
              placeholder="Название салона"
              value={contactDraft.salon_name}
              onChange={(event) => {
                const value = event.currentTarget.value
                setContactDraft((current) =>
                  current ? { ...current, salon_name: value } : current,
                )
              }}
            />
            <input
              type="text"
              placeholder="Телефон"
              value={contactDraft.phone}
              onChange={(event) => {
                const value = event.currentTarget.value
                setContactDraft((current) =>
                  current ? { ...current, phone: value } : current,
                )
              }}
            />
            <input
              type="email"
              placeholder="Email"
              value={contactDraft.email}
              onChange={(event) => {
                const value = event.currentTarget.value
                setContactDraft((current) =>
                  current ? { ...current, email: value } : current,
                )
              }}
            />
            <input
              type="text"
              placeholder="Адрес"
              value={contactDraft.address}
              onChange={(event) => {
                const value = event.currentTarget.value
                setContactDraft((current) =>
                  current ? { ...current, address: value } : current,
                )
              }}
            />
            <input
              type="text"
              placeholder="Ссылка маршрута"
              value={contactDraft.route_url}
              onChange={(event) => {
                const value = event.currentTarget.value
                setContactDraft((current) =>
                  current ? { ...current, route_url: value } : current,
                )
              }}
            />
            <button type="submit" disabled={isSavingContact}>
              {isSavingContact ? 'Сохраняем...' : 'Сохранить контакты'}
            </button>
          </form>
        ) : null}
      </AdminModal>

      <AdminModal
        open={isGeneralModalOpen}
        title="Редактирование общего графика"
        onClose={() => {
          if (isSavingGeneral) {
            return
          }
          setIsGeneralModalOpen(false)
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSaveGeneralHours(event)}>
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
                {generalDaysDraft.map((day) => (
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
                                setGeneralDaysDraft((current) =>
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
                                setGeneralDaysDraft((current) =>
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
                                setGeneralDaysDraft((current) =>
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
                              setGeneralDaysDraft((current) =>
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
                            setGeneralDaysDraft((current) =>
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

          <button type="submit" disabled={isSavingGeneral}>
            {isSavingGeneral ? 'Сохраняем...' : 'Сохранить общий график'}
          </button>
        </form>
      </AdminModal>

      <AdminModal
        open={isSpecialistModalOpen}
        title={
          selectedSpecialist
            ? `График специалиста: ${selectedSpecialist.full_name}`
            : 'График специалиста'
        }
        onClose={() => {
          if (isSavingSpecialist) {
            return
          }
          setIsSpecialistModalOpen(false)
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSaveSpecialistHours(event)}>
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
                {specialistDaysDraft.map((day) => (
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
                              disabled={day.is_closed || !selectedSpecialistId}
                              onChange={(event) => {
                                const value = event.currentTarget.value
                                setSpecialistDaysDraft((current) =>
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
                              disabled={day.is_closed || !selectedSpecialistId}
                              onChange={(event) => {
                                const value = event.currentTarget.value
                                setSpecialistDaysDraft((current) =>
                                  updateIntervalDraft(current, day.day_of_week, index, {
                                    close_time: value,
                                  }),
                                )
                              }}
                            />
                            <button
                              className="admin-inline-btn"
                              type="button"
                              disabled={day.is_closed || day.intervals.length <= 1 || !selectedSpecialistId}
                              onClick={() => {
                                setSpecialistDaysDraft((current) =>
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
                            disabled={day.is_closed || !selectedSpecialistId}
                            onClick={() => {
                              setSpecialistDaysDraft((current) =>
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
                          disabled={!selectedSpecialistId}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked
                            setSpecialistDaysDraft((current) =>
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

          <button type="submit" disabled={isSavingSpecialist || !selectedSpecialistId}>
            {isSavingSpecialist ? 'Сохраняем...' : 'Сохранить график специалиста'}
          </button>
        </form>
      </AdminModal>

      {isLoading ? <p className="admin-inline-note">Загружаем данные...</p> : null}
    </section>
  )
}

export default ContactsPage
