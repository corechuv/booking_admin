import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  createAdminClient,
  fetchAdminClientDetails,
  fetchAdminClients,
  fetchAdminSpecialists,
  getStoredAdminToken,
  updateAdminClient,
  type AdminClientGender,
  type AdminStaffClient,
  type AdminStaffClientDetails,
  type AdminSpecialist,
  type AuthUser,
  type UpdateAdminStaffClientPayload,
} from '../api/backend-api'
import AdminModal from '../components/AdminModal'
import { bookingStatusLabel, formatBookingDateTime } from '../lib/admin-format'

type ClientsPageProps = {
  currentUser: AuthUser
}

type GenderFormValue = '' | AdminClientGender

type ClientFormState = {
  fullName: string
  email: string
  phone: string
  gender: GenderFormValue
  notes: string
}

type CreateFormState = ClientFormState & {
  specialistId: string
}

const emptyClientForm: ClientFormState = {
  fullName: '',
  email: '',
  phone: '',
  gender: '',
  notes: '',
}

const emptyCreateForm: CreateFormState = {
  ...emptyClientForm,
  specialistId: '',
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Не удалось загрузить клиентов.'
}

const toGenderLabel = (gender: AdminClientGender | null): string => {
  if (gender === 'male') {
    return 'Мужской'
  }
  if (gender === 'female') {
    return 'Женский'
  }
  return '—'
}

const toLastVisitLabel = (value: string | null): string => {
  if (!value) {
    return '—'
  }
  return formatBookingDateTime(value)
}

const toClientForm = (client: AdminStaffClientDetails): ClientFormState => ({
  fullName: client.full_name,
  email: client.email ?? '',
  phone: client.phone ?? '',
  gender: client.gender ?? '',
  notes: client.notes ?? '',
})

const normalizeEmail = (value: string): string | null => {
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

const normalizeText = (value: string): string | null => {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function ClientsPage({ currentUser }: ClientsPageProps) {
  const isSpecialist = currentUser.role === 'specialist'

  const [clients, setClients] = useState<AdminStaffClient[]>([])
  const [specialists, setSpecialists] = useState<AdminSpecialist[]>([])
  const [selectedSpecialistId, setSelectedSpecialistId] = useState('')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm)
  const [isCreating, setIsCreating] = useState(false)

  const [selectedClient, setSelectedClient] = useState<AdminStaffClientDetails | null>(null)
  const [clientForm, setClientForm] = useState<ClientFormState>(emptyClientForm)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [isSavingClient, setIsSavingClient] = useState(false)

  const loadSpecialists = useCallback(async () => {
    if (isSpecialist) {
      setSpecialists([])
      return
    }

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    try {
      const nextSpecialists = await fetchAdminSpecialists(token)
      setSpecialists(nextSpecialists)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }, [isSpecialist])

  const loadClients = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const specialistId = Number.parseInt(selectedSpecialistId, 10)
      const nextClients = await fetchAdminClients(token, {
        limit: 500,
        search: search.trim() || undefined,
        specialist_id:
          !isSpecialist && Number.isFinite(specialistId) && specialistId > 0
            ? specialistId
            : undefined,
      })
      setClients(nextClients)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [isSpecialist, search, selectedSpecialistId])

  useEffect(() => {
    void loadSpecialists()
  }, [loadSpecialists])

  useEffect(() => {
    void loadClients()
  }, [loadClients])

  const openClientDetails = async (clientId: number) => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsDetailsOpen(true)
    setIsDetailsLoading(true)
    setError(null)

    try {
      const details = await fetchAdminClientDetails(token, clientId)
      setSelectedClient(details)
      setClientForm(toClientForm(details))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      setIsDetailsOpen(false)
    } finally {
      setIsDetailsLoading(false)
    }
  }

  const closeClientDetails = () => {
    setIsDetailsOpen(false)
    setSelectedClient(null)
    setClientForm(emptyClientForm)
  }

  const handleClientRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, clientId: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    void openClientDetails(clientId)
  }

  const handleSaveClient = async () => {
    if (!selectedClient) {
      return
    }

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const fullName = clientForm.fullName.trim()
    if (!fullName) {
      setError('Введите имя клиента.')
      return
    }

    const payload: UpdateAdminStaffClientPayload = {
      full_name: fullName,
      email: normalizeEmail(clientForm.email),
      phone: normalizeText(clientForm.phone),
      gender: clientForm.gender || null,
      notes: normalizeText(clientForm.notes),
    }

    setIsSavingClient(true)
    setError(null)

    try {
      const updated = await updateAdminClient(token, selectedClient.id, payload)
      setClients((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      const refreshed = await fetchAdminClientDetails(token, selectedClient.id)
      setSelectedClient(refreshed)
      setClientForm(toClientForm(refreshed))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingClient(false)
    }
  }

  const openCreateModal = () => {
    setCreateForm((current) => ({
      ...emptyCreateForm,
      specialistId: isSpecialist ? String(currentUser.id) : current.specialistId,
    }))
    setIsCreateOpen(true)
  }

  const closeCreateModal = () => {
    setIsCreateOpen(false)
    setCreateForm(emptyCreateForm)
  }

  const handleCreateClient = async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const fullName = createForm.fullName.trim()
    if (!fullName) {
      setError('Введите имя клиента.')
      return
    }

    let specialistIdPayload: number | null | undefined = undefined
    if (!isSpecialist) {
      const parsed = Number.parseInt(createForm.specialistId, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Выберите специалиста.')
        return
      }
      specialistIdPayload = parsed
    }

    setIsCreating(true)
    setError(null)

    try {
      const created = await createAdminClient(token, {
        specialist_id: specialistIdPayload,
        full_name: fullName,
        email: normalizeEmail(createForm.email),
        phone: normalizeText(createForm.phone),
        gender: createForm.gender || null,
        notes: normalizeText(createForm.notes),
      })
      setClients((current) => [created, ...current])
      closeCreateModal()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsCreating(false)
    }
  }

  const tableSubtitle = useMemo(() => {
    if (isSpecialist) {
      return `${clients.length} клиентов`
    }
    return `${clients.length} карточек клиентов`
  }, [clients.length, isSpecialist])

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>{isSpecialist ? 'Мои клиенты' : 'Клиенты'}</h1>
        <p>Профили клиентов по каждому специалисту отдельно, без пересечений.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card admin-card--latest">
        <div className="admin-card__head">
          <h2>Список клиентов</h2>
          <span>{tableSubtitle}</span>
        </div>

        <form
          className="admin-service-form"
          onSubmit={(event) => {
            event.preventDefault()
            void loadClients()
          }}
        >
          <div className="admin-service-form__row">
            <label className="admin-form-field">
              <span>Поиск</span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Имя, email или телефон"
              />
            </label>

            {!isSpecialist ? (
              <label className="admin-form-field">
                <span>Специалист</span>
                <select
                  value={selectedSpecialistId}
                  onChange={(event) => setSelectedSpecialistId(event.currentTarget.value)}
                >
                  <option value="">Все специалисты</option>
                  {specialists.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.full_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="admin-actions-cell">
            <button className="admin-inline-btn" type="submit" disabled={isLoading}>
              Обновить
            </button>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              onClick={openCreateModal}
            >
              Добавить клиента
            </button>
          </div>
        </form>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Клиент</th>
                {!isSpecialist ? <th>Специалист</th> : null}
                <th>Пол</th>
                <th>Email</th>
                <th>Телефон</th>
                <th>Записей</th>
                <th>Последняя запись</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="admin-table-row-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => void openClientDetails(client.id)}
                  onKeyDown={(event) => handleClientRowKeyDown(event, client.id)}
                >
                  <td>{client.full_name}</td>
                  {!isSpecialist ? <td>{client.specialist_name}</td> : null}
                  <td>{toGenderLabel(client.gender)}</td>
                  <td>{client.email || '—'}</td>
                  <td>{client.phone || '—'}</td>
                  <td>{client.bookings_count}</td>
                  <td>{toLastVisitLabel(client.last_booking_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!clients.length && !isLoading ? (
          <p className="admin-inline-note">Список клиентов пуст.</p>
        ) : null}
      </article>

      <AdminModal
        open={isCreateOpen}
        title="Новый клиент"
        onClose={closeCreateModal}
        footer={
          <>
            <button className="admin-inline-btn" type="button" onClick={closeCreateModal}>
              Закрыть
            </button>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              disabled={isCreating}
              onClick={() => void handleCreateClient()}
            >
              {isCreating ? 'Сохраняем...' : 'Создать'}
            </button>
          </>
        }
      >
        <form className="admin-service-form" onSubmit={(event) => event.preventDefault()}>
          {!isSpecialist ? (
            <label className="admin-form-field">
              <span>Специалист</span>
              <select
                value={createForm.specialistId}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setCreateForm((current) => ({
                    ...current,
                    specialistId: value,
                  }))
                }}
              >
                <option value="">Выберите специалиста</option>
                {specialists.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="admin-service-form__row">
            <label className="admin-form-field">
              <span>Имя клиента</span>
              <input
                type="text"
                value={createForm.fullName}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setCreateForm((current) => ({ ...current, fullName: value }))
                }}
              />
            </label>
            <label className="admin-form-field">
              <span>Пол</span>
              <select
                value={createForm.gender}
                onChange={(event) => {
                  const value = event.currentTarget.value as GenderFormValue
                  setCreateForm((current) => ({
                    ...current,
                    gender: value,
                  }))
                }}
              >
                <option value="">Не указан</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
              </select>
            </label>
          </div>

          <div className="admin-service-form__row">
            <label className="admin-form-field">
              <span>Email</span>
              <input
                type="email"
                value={createForm.email}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setCreateForm((current) => ({ ...current, email: value }))
                }}
              />
            </label>
            <label className="admin-form-field">
              <span>Телефон</span>
              <input
                type="text"
                value={createForm.phone}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setCreateForm((current) => ({ ...current, phone: value }))
                }}
              />
            </label>
          </div>

          <label className="admin-form-field">
            <span>Заметки</span>
            <textarea
              rows={4}
              value={createForm.notes}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCreateForm((current) => ({ ...current, notes: value }))
              }}
            />
          </label>
        </form>
      </AdminModal>

      <AdminModal
        open={isDetailsOpen}
        title={selectedClient ? selectedClient.full_name : 'Профиль клиента'}
        onClose={closeClientDetails}
        footer={
          <>
            <button className="admin-inline-btn" type="button" onClick={closeClientDetails}>
              Закрыть
            </button>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              disabled={!selectedClient || isSavingClient || isDetailsLoading}
              onClick={() => void handleSaveClient()}
            >
              {isSavingClient ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </>
        }
      >
        {selectedClient && !isDetailsLoading ? (
          <div className="admin-block">
            <form className="admin-service-form" onSubmit={(event) => event.preventDefault()}>
              <div className="admin-service-form__row">
                <label className="admin-form-field">
                  <span>Имя клиента</span>
                  <input
                    type="text"
                    value={clientForm.fullName}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      setClientForm((current) => ({ ...current, fullName: value }))
                    }}
                  />
                </label>
                <label className="admin-form-field">
                  <span>Пол</span>
                  <select
                    value={clientForm.gender}
                    onChange={(event) => {
                      const value = event.currentTarget.value as GenderFormValue
                      setClientForm((current) => ({
                        ...current,
                        gender: value,
                      }))
                    }}
                  >
                    <option value="">Не указан</option>
                    <option value="male">Мужской</option>
                    <option value="female">Женский</option>
                  </select>
                </label>
              </div>

              <div className="admin-service-form__row">
                <label className="admin-form-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={clientForm.email}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      setClientForm((current) => ({ ...current, email: value }))
                    }}
                  />
                </label>
                <label className="admin-form-field">
                  <span>Телефон</span>
                  <input
                    type="text"
                    value={clientForm.phone}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      setClientForm((current) => ({ ...current, phone: value }))
                    }}
                  />
                </label>
              </div>

              <label className="admin-form-field">
                <span>Заметки</span>
                <textarea
                  rows={4}
                  value={clientForm.notes}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setClientForm((current) => ({ ...current, notes: value }))
                  }}
                />
              </label>
            </form>

            <article className="admin-card admin-card--latest">
              <div className="admin-card__head">
                <h2>Записи клиента</h2>
                <span>{selectedClient.bookings.length} записей</span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Процедура</th>
                      <th>Дата и время</th>
                      <th>Статус</th>
                      <th>Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedClient.bookings.map((booking) => (
                      <tr key={booking.id}>
                        <td>{booking.service_title}</td>
                        <td>{formatBookingDateTime(booking.starts_at)}</td>
                        <td>{bookingStatusLabel[booking.status]}</td>
                        <td>{booking.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!selectedClient.bookings.length ? (
                <p className="admin-inline-note">У клиента пока нет записей.</p>
              ) : null}
            </article>
          </div>
        ) : (
          <p className="admin-inline-note">Загрузка...</p>
        )}
      </AdminModal>
    </section>
  )
}

export default ClientsPage
