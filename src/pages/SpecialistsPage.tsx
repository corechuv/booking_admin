import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  createAdminSpecialist,
  createAdminSpecialistCustomService,
  deleteAdminSpecialistCustomService,
  deleteAdminSpecialist,
  fetchAdminCategories,
  fetchAdminServices,
  fetchAdminSpecialistServices,
  fetchAdminSpecialists,
  getStoredAdminToken,
  updateAdminSpecialist,
  updateAdminSpecialistSharedServices,
  updateAdminSpecialistCustomService,
  type AuthUser,
  type AdminCategory,
  type AdminService,
  type AdminSpecialist,
} from '../api/backend-api'
import AdminModal from '../components/AdminModal'
import ConfirmModal from '../components/ConfirmModal'
import { formatPrice } from '../lib/admin-format'

type SpecialistFormState = {
  fullName: string
  email: string
  phone: string
  title: string
  bio: string
  photoUrl: string
  password: string
  isActive: boolean
}

type CustomServiceFormState = {
  categoryId: string
  title: string
  titleRu: string
  titleUk: string
  titleDe: string
  description: string
  descriptionRu: string
  descriptionUk: string
  descriptionDe: string
  duration: string
  price: string
  oldPrice: string
  isActive: boolean
}

const emptyCreateForm: SpecialistFormState = {
  fullName: '',
  email: '',
  phone: '',
  title: '',
  bio: '',
  photoUrl: '',
  password: '',
  isActive: true,
}

const emptyCustomServiceForm: CustomServiceFormState = {
  categoryId: '',
  title: '',
  titleRu: '',
  titleUk: '',
  titleDe: '',
  description: '',
  descriptionRu: '',
  descriptionUk: '',
  descriptionDe: '',
  duration: '',
  price: '',
  oldPrice: '',
  isActive: true,
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Ошибка при работе со специалистами.'
}

const specialistToFormState = (specialist: AdminSpecialist): SpecialistFormState => ({
  fullName: specialist.full_name,
  email: specialist.email,
  phone: specialist.phone ?? '',
  title: specialist.title,
  bio: specialist.bio ?? '',
  photoUrl: specialist.photo_url ?? '',
  password: '',
  isActive: specialist.is_active,
})

const serviceToCustomServiceFormState = (service: AdminService): CustomServiceFormState => ({
  categoryId: String(service.category_id),
  title: service.title,
  titleRu: service.title_i18n?.ru ?? '',
  titleUk: service.title_i18n?.uk ?? '',
  titleDe: service.title_i18n?.de ?? '',
  description: service.description ?? '',
  descriptionRu: service.description_i18n?.ru ?? '',
  descriptionUk: service.description_i18n?.uk ?? '',
  descriptionDe: service.description_i18n?.de ?? '',
  duration: String(service.duration_minutes),
  price: String(service.price),
  oldPrice: service.old_price === null ? '' : String(service.old_price),
  isActive: service.is_active,
})

const toI18nMapOrNull = (values: { ru: string; uk: string; de: string }): Record<string, string> | null => {
  const next: Record<string, string> = {}
  const ru = values.ru.trim()
  const uk = values.uk.trim()
  const de = values.de.trim()

  if (ru) {
    next.ru = ru
  }
  if (uk) {
    next.uk = uk
  }
  if (de) {
    next.de = de
  }

  return Object.keys(next).length > 0 ? next : null
}

type SpecialistsPageProps = {
  currentUser: AuthUser
}

function SpecialistsPage({ currentUser }: SpecialistsPageProps) {
  const [specialists, setSpecialists] = useState<AdminSpecialist[]>([])
  const [services, setServices] = useState<AdminService[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<number | null>(null)
  const [sharedServiceIds, setSharedServiceIds] = useState<number[]>([])
  const [customServices, setCustomServices] = useState<AdminService[]>([])
  const [sharedCategoryId, setSharedCategoryId] = useState<string>('')
  const [sharedServiceId, setSharedServiceId] = useState<string>('')

  const [specialistForm, setSpecialistForm] = useState<SpecialistFormState>(emptyCreateForm)
  const [specialistModalMode, setSpecialistModalMode] = useState<'create' | 'edit'>('create')
  const [customServiceForm, setCustomServiceForm] = useState<CustomServiceFormState>(
    emptyCustomServiceForm,
  )
  const [customServiceModalMode, setCustomServiceModalMode] = useState<'create' | 'edit'>('create')
  const [editingCustomService, setEditingCustomService] = useState<AdminService | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<AdminSpecialist | null>(null)
  const [customServiceDeleteCandidate, setCustomServiceDeleteCandidate] = useState<AdminService | null>(null)

  const [isSpecialistModalOpen, setIsSpecialistModalOpen] = useState(false)
  const [isCustomServiceModalOpen, setIsCustomServiceModalOpen] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isSubmittingSpecialist, setIsSubmittingSpecialist] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deletingCustomServiceId, setDeletingCustomServiceId] = useState<number | null>(null)
  const [isSavingShared, setIsSavingShared] = useState(false)
  const [isSavingCustomService, setIsSavingCustomService] = useState(false)
  const canManageSpecialists = currentUser.role === 'admin' || currentUser.role === 'super_admin'
  const isSpecialistView = currentUser.role === 'specialist'

  const loadData = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [nextSpecialists, nextServices, nextCategories] = await Promise.all([
        fetchAdminSpecialists(token),
        fetchAdminServices(token),
        fetchAdminCategories(token),
      ])

      setSpecialists(nextSpecialists)
      setServices(nextServices)
      setCategories(nextCategories)
      const forcedSpecialistId = currentUser.role === 'specialist' ? currentUser.id : null
      if (forcedSpecialistId) {
        setSelectedSpecialistId(forcedSpecialistId)
      } else if (
        !selectedSpecialistId ||
        !nextSpecialists.some((item) => item.id === selectedSpecialistId)
      ) {
        setSelectedSpecialistId(nextSpecialists.length ? nextSpecialists[0].id : null)
      }
      setCustomServiceForm((current) => ({
        ...current,
        categoryId: current.categoryId || String(nextCategories[0]?.id ?? ''),
      }))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [currentUser.id, currentUser.role, selectedSpecialistId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const specialistId = selectedSpecialistId
    if (!specialistId) {
      setSharedServiceIds([])
      setCustomServices([])
      return
    }

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const loadSpecialistServices = async () => {
      setError(null)
      try {
        const payload = await fetchAdminSpecialistServices(token, specialistId)
        setSharedServiceIds(payload.shared_service_ids)
        setCustomServices(payload.custom_services)
      } catch (requestError) {
        setError(getErrorMessage(requestError))
      }
    }

    void loadSpecialistServices()
  }, [selectedSpecialistId])

  const selectedSpecialist = useMemo(
    () => specialists.find((item) => item.id === selectedSpecialistId) ?? null,
    [selectedSpecialistId, specialists],
  )

  const sharedServices = useMemo(
    () => services.filter((service) => service.owner_specialist_id === null),
    [services],
  )

  const sharedCategories = useMemo(() => {
    const categoryIds = new Set(sharedServices.map((service) => service.category_id))
    return categories.filter((category) => categoryIds.has(category.id))
  }, [categories, sharedServices])

  const sharedServicesForCategory = useMemo(() => {
    const categoryId = Number.parseInt(sharedCategoryId, 10)
    if (Number.isNaN(categoryId)) {
      return []
    }
    return sharedServices
      .filter((service) => service.category_id === categoryId && service.is_active)
      .sort((left, right) => left.title.localeCompare(right.title))
  }, [sharedCategoryId, sharedServices])

  const selectedSharedServices = useMemo(
    () =>
      sharedServices
        .filter((service) => sharedServiceIds.includes(service.id))
        .sort(
          (left, right) =>
            left.category.localeCompare(right.category) || left.title.localeCompare(right.title),
        ),
    [sharedServiceIds, sharedServices],
  )

  useEffect(() => {
    if (!sharedCategories.length) {
      if (sharedCategoryId) {
        setSharedCategoryId('')
      }
      return
    }

    if (!sharedCategories.some((category) => String(category.id) === sharedCategoryId)) {
      setSharedCategoryId(String(sharedCategories[0].id))
    }
  }, [sharedCategories, sharedCategoryId])

  useEffect(() => {
    if (!sharedServicesForCategory.length) {
      if (sharedServiceId) {
        setSharedServiceId('')
      }
      return
    }

    if (!sharedServicesForCategory.some((service) => String(service.id) === sharedServiceId)) {
      setSharedServiceId(String(sharedServicesForCategory[0].id))
    }
  }, [sharedServicesForCategory, sharedServiceId])

  const openCreateSpecialistModal = () => {
    setSpecialistModalMode('create')
    setEditingId(null)
    setSpecialistForm(emptyCreateForm)
    setIsSpecialistModalOpen(true)
  }

  const openEditSpecialistModal = (specialist: AdminSpecialist) => {
    setSpecialistModalMode('edit')
    setEditingId(specialist.id)
    setSpecialistForm(specialistToFormState(specialist))
    setIsSpecialistModalOpen(true)
  }

  const closeSpecialistModal = () => {
    setEditingId(null)
    setSpecialistForm(emptyCreateForm)
    setIsSpecialistModalOpen(false)
  }

  const openCreateCustomServiceModal = () => {
    setCustomServiceModalMode('create')
    setEditingCustomService(null)
    setCustomServiceForm((current) => ({
      ...emptyCustomServiceForm,
      categoryId: current.categoryId || String(categories[0]?.id ?? ''),
      isActive: true,
    }))
    setIsCustomServiceModalOpen(true)
  }

  const openEditCustomServiceModal = (service: AdminService) => {
    setCustomServiceModalMode('edit')
    setEditingCustomService(service)
    setCustomServiceForm(serviceToCustomServiceFormState(service))
    setIsCustomServiceModalOpen(true)
  }

  const closeCustomServiceModal = () => {
    setCustomServiceModalMode('create')
    setEditingCustomService(null)
    setCustomServiceForm((current) => ({
      ...emptyCustomServiceForm,
      categoryId: current.categoryId || String(categories[0]?.id ?? ''),
      isActive: true,
    }))
    setIsCustomServiceModalOpen(false)
  }

  const handleSubmitSpecialist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    if (specialistModalMode === 'edit' && !editingId) {
      return
    }

    const payload = {
      full_name: specialistForm.fullName.trim(),
      email: specialistForm.email.trim().toLowerCase(),
      phone: specialistForm.phone.trim() || null,
      title: specialistForm.title.trim(),
      bio: specialistForm.bio.trim() || null,
      photo_url: specialistForm.photoUrl.trim() || null,
      is_active: specialistForm.isActive,
    }

    setIsSubmittingSpecialist(true)
    if (specialistModalMode === 'edit' && editingId) {
      setUpdatingId(editingId)
    }
    setError(null)

    try {
      if (specialistModalMode === 'create') {
        const created = await createAdminSpecialist(token, {
          ...payload,
          password: specialistForm.password.trim() || undefined,
          send_invite: true,
        })
        setSpecialists((current) => [...current, created])
        setSelectedSpecialistId(created.id)
      } else {
        const updated = await updateAdminSpecialist(token, editingId!, {
          ...payload,
          password: specialistForm.password.trim() || undefined,
        })
        setSpecialists((current) =>
          current.map((item) => (item.id === editingId ? { ...item, ...updated } : item)),
        )
      }
      closeSpecialistModal()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmittingSpecialist(false)
      setUpdatingId(null)
    }
  }

  const handleToggleSpecialist = async (specialist: AdminSpecialist) => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setUpdatingId(specialist.id)
    setError(null)

    try {
      const updated = await updateAdminSpecialist(token, specialist.id, {
        is_active: !specialist.is_active,
      })
      setSpecialists((current) =>
        current.map((item) => (item.id === specialist.id ? { ...item, ...updated } : item)),
      )
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDeleteSpecialist = async () => {
    if (!deleteCandidate) {
      return
    }

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setDeletingId(deleteCandidate.id)
    setError(null)

    try {
      await deleteAdminSpecialist(token, deleteCandidate.id)
      setSpecialists((current) => current.filter((item) => item.id !== deleteCandidate.id))
      if (selectedSpecialistId === deleteCandidate.id) {
        setSelectedSpecialistId(null)
      }
      if (editingId === deleteCandidate.id) {
        closeSpecialistModal()
      }
      setDeleteCandidate(null)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDeletingId(null)
    }
  }

  const handleAddSharedService = () => {
    if (!selectedSpecialistId) {
      return
    }

    const serviceId = Number.parseInt(sharedServiceId, 10)
    if (Number.isNaN(serviceId)) {
      setError('Выберите услугу из каталога.')
      return
    }

    setError(null)
    setSharedServiceIds((current) =>
      current.includes(serviceId) ? current : [...current, serviceId],
    )
  }

  const handleRemoveSharedService = (serviceId: number) => {
    setSharedServiceIds((current) => current.filter((item) => item !== serviceId))
  }

  const handleSaveSharedServices = async () => {
    const token = getStoredAdminToken()
    if (!token || !selectedSpecialistId) {
      return
    }

    setIsSavingShared(true)
    setError(null)

    try {
      const updated = await updateAdminSpecialistSharedServices(token, selectedSpecialistId, {
        service_ids: sharedServiceIds,
      })
      setSharedServiceIds(updated.service_ids)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingShared(false)
    }
  }

  const handleSaveCustomService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const token = getStoredAdminToken()
    if (!token || !selectedSpecialistId) {
      return
    }

    const categoryId = Number.parseInt(customServiceForm.categoryId, 10)
    const duration = Number.parseInt(customServiceForm.duration, 10)
    const price = Number.parseFloat(customServiceForm.price)
    const oldPrice = customServiceForm.oldPrice.trim()
      ? Number.parseFloat(customServiceForm.oldPrice)
      : null

    if (Number.isNaN(categoryId) || categoryId < 1) {
      setError('Выберите категорию услуги.')
      return
    }

    if (Number.isNaN(duration) || duration < 15) {
      setError('Длительность должна быть не меньше 15 минут.')
      return
    }

    if (Number.isNaN(price) || price <= 0) {
      setError('Цена должна быть больше 0.')
      return
    }

    if (oldPrice !== null) {
      if (Number.isNaN(oldPrice) || oldPrice <= 0) {
        setError('Старая цена должна быть больше 0.')
        return
      }
      if (oldPrice <= price) {
        setError('Старая цена должна быть больше текущей цены.')
        return
      }
    }

    setIsSavingCustomService(true)
    setError(null)

    try {
      const payload = {
        category_id: categoryId,
        title: customServiceForm.title.trim(),
        title_i18n: toI18nMapOrNull({
          ru: customServiceForm.titleRu,
          uk: customServiceForm.titleUk,
          de: customServiceForm.titleDe,
        }),
        description: customServiceForm.description.trim() || null,
        description_i18n: toI18nMapOrNull({
          ru: customServiceForm.descriptionRu,
          uk: customServiceForm.descriptionUk,
          de: customServiceForm.descriptionDe,
        }),
        duration_minutes: duration,
        price,
        old_price: oldPrice,
        is_active: customServiceForm.isActive,
      }

      if (customServiceModalMode === 'edit' && editingCustomService) {
        const updated = await updateAdminSpecialistCustomService(
          token,
          selectedSpecialistId,
          editingCustomService.id,
          payload,
        )
        setCustomServices((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
        setServices((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
      } else {
        const created = await createAdminSpecialistCustomService(token, selectedSpecialistId, payload)
        setCustomServices((current) => [...current, created])
        setServices((current) => [...current, created])
      }
      closeCustomServiceModal()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingCustomService(false)
    }
  }

  const handleDeleteCustomService = async () => {
    if (!customServiceDeleteCandidate || !selectedSpecialistId) {
      return
    }

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setDeletingCustomServiceId(customServiceDeleteCandidate.id)
    setError(null)

    try {
      await deleteAdminSpecialistCustomService(
        token,
        selectedSpecialistId,
        customServiceDeleteCandidate.id,
      )
      setCustomServices((current) =>
        current.filter((item) => item.id !== customServiceDeleteCandidate.id),
      )
      setServices((current) =>
        current.filter((item) => item.id !== customServiceDeleteCandidate.id),
      )
      setCustomServiceDeleteCandidate(null)
      if (editingCustomService?.id === customServiceDeleteCandidate.id) {
        closeCustomServiceModal()
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDeletingCustomServiceId(null)
    }
  }

  const editingSpecialist =
    editingId === null ? null : specialists.find((item) => item.id === editingId) ?? null

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>{isSpecialistView ? 'Мои услуги' : 'Управление специалистами'}</h1>
        <p>
          {isSpecialistView
            ? 'Выберите услуги из каталога по категории или создайте персональные услуги.'
            : 'Специалисты, общие услуги и персональные услуги.'}
        </p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      {canManageSpecialists ? (
      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Список специалистов</h2>
          <div className="admin-actions-cell">
            <span>{specialists.length} специалистов</span>
            {canManageSpecialists ? (
              <button
                className="admin-inline-btn admin-inline-btn--accent"
                type="button"
                onClick={openCreateSpecialistModal}
              >
                Добавить специалиста
              </button>
            ) : null}
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {specialists.map((item) => {
                const isBusy = updatingId === item.id || deletingId === item.id

                return (
                  <tr key={item.id}>
                    <td>{item.full_name}</td>
                    <td>{item.email}</td>
                    <td>{item.title}</td>
                    <td>{item.is_active ? 'Активен' : 'Скрыт'}</td>
                    <td className="admin-actions-cell">
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={() => setSelectedSpecialistId(item.id)}
                      >
                        Выбрать
                      </button>
                      {canManageSpecialists ? (
                        <>
                          <button
                            className="admin-inline-btn"
                            type="button"
                            disabled={isBusy}
                            onClick={() => openEditSpecialistModal(item)}
                          >
                            Изменить
                          </button>
                          <button
                            className="admin-inline-btn"
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleToggleSpecialist(item)}
                          >
                            {updatingId === item.id
                              ? 'Обновляем...'
                              : item.is_active
                                ? 'Скрыть'
                                : 'Активировать'}
                          </button>
                          <button
                            className="admin-inline-btn is-danger"
                            type="button"
                            disabled={isBusy}
                            onClick={() => setDeleteCandidate(item)}
                          >
                            {deletingId === item.id ? 'Удаляем...' : 'Удалить'}
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!specialists.length && !isLoading ? (
          <p className="admin-inline-note">Специалисты пока не добавлены.</p>
        ) : null}
      </article>
      ) : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>{isSpecialistView ? 'Услуги из каталога' : 'Общие услуги специалиста'}</h2>
          <span>{selectedSpecialist ? selectedSpecialist.full_name : 'Специалист не выбран'}</span>
        </div>

        {canManageSpecialists ? (
          <div className="admin-service-form__row">
            <select
              value={selectedSpecialistId ?? ''}
              onChange={(event) =>
                setSelectedSpecialistId(Number.parseInt(event.currentTarget.value, 10) || null)
              }
            >
              {!specialists.length ? <option value="">Нет специалистов</option> : null}
              {specialists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="admin-service-form">
          <div className="admin-service-form__row">
            <label className="admin-form-field">
              <span>Категория</span>
              <select
                value={sharedCategoryId}
                onChange={(event) => setSharedCategoryId(event.currentTarget.value)}
                disabled={!selectedSpecialistId || !sharedCategories.length}
              >
                {!sharedCategories.length ? <option value="">Категории недоступны</option> : null}
                {sharedCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-form-field">
              <span>Услуга из каталога</span>
              <select
                value={sharedServiceId}
                onChange={(event) => setSharedServiceId(event.currentTarget.value)}
                disabled={!selectedSpecialistId || !sharedServicesForCategory.length}
              >
                {!sharedServicesForCategory.length ? (
                  <option value="">Услуги недоступны</option>
                ) : null}
                {sharedServicesForCategory.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-actions-cell">
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              disabled={!selectedSpecialistId || !sharedServiceId}
              onClick={handleAddSharedService}
            >
              Добавить из каталога
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Услуга</th>
                <th>Категория</th>
                <th>Длительность</th>
                <th>Цена</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {selectedSharedServices.map((service) => (
                <tr key={service.id}>
                  <td>{service.title}</td>
                  <td>{service.category}</td>
                  <td>{service.duration_minutes} мин</td>
                  <td>{formatPrice(service.price)}</td>
                  <td className="admin-actions-cell">
                    <button
                      className="admin-inline-btn is-danger"
                      type="button"
                      onClick={() => handleRemoveSharedService(service.id)}
                    >
                      Убрать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!selectedSharedServices.length && !isLoading ? (
          <p className="admin-inline-note">Пока нет добавленных услуг из общего каталога.</p>
        ) : null}

        <button
          className="admin-inline-btn"
          type="button"
          disabled={isSavingShared || !selectedSpecialistId}
          onClick={() => void handleSaveSharedServices()}
        >
          {isSavingShared ? 'Сохраняем...' : 'Сохранить общие услуги'}
        </button>
      </article>

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>{isSpecialistView ? 'Мои персональные услуги' : 'Персональные услуги специалиста'}</h2>
          <div className="admin-actions-cell">
            <span>{customServices.length} услуг</span>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              disabled={!selectedSpecialistId}
              onClick={openCreateCustomServiceModal}
            >
              Добавить персональную услугу
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Услуга</th>
                <th>Категория</th>
                <th>Длительность</th>
                <th>Цена</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {customServices.map((service) => (
                <tr key={service.id}>
                  <td>{service.title}</td>
                  <td>{service.category}</td>
                  <td>{service.duration_minutes} мин</td>
                  <td>
                    {service.old_price ? (
                      <>
                        <span className="admin-price-old">{formatPrice(service.old_price)}</span>{' '}
                        {formatPrice(service.price)}
                        {service.discount_percent ? ` (-${service.discount_percent}%)` : ''}
                      </>
                    ) : (
                      formatPrice(service.price)
                    )}
                  </td>
                  <td>{service.is_active ? 'Активна' : 'Скрыта'}</td>
                  <td className="admin-actions-cell">
                    <button
                      className="admin-inline-btn"
                      type="button"
                      onClick={() => openEditCustomServiceModal(service)}
                    >
                      Изменить
                    </button>
                    <button
                      className="admin-inline-btn is-danger"
                      type="button"
                      disabled={deletingCustomServiceId === service.id}
                      onClick={() => setCustomServiceDeleteCandidate(service)}
                    >
                      {deletingCustomServiceId === service.id ? 'Удаляем...' : 'Удалить'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <AdminModal
        open={isSpecialistModalOpen}
        title={
          specialistModalMode === 'create'
            ? 'Новый специалист'
            : editingSpecialist
              ? `Редактирование: ${editingSpecialist.full_name}`
              : 'Редактирование специалиста'
        }
        onClose={() => {
          if (isSubmittingSpecialist) {
            return
          }
          closeSpecialistModal()
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSubmitSpecialist(event)}>
          <label className="admin-form-field">
            <span>Имя специалиста</span>
            <input
              className={specialistModalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="text"
              value={specialistForm.fullName}
              onChange={(event) => {
                const value = event.currentTarget.value
                setSpecialistForm((current) => ({ ...current, fullName: value }))
              }}
              required
            />
          </label>
          <label className="admin-form-field">
            <span>Email</span>
            <input
              className={specialistModalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="email"
              value={specialistForm.email}
              onChange={(event) => {
                const value = event.currentTarget.value
                setSpecialistForm((current) => ({ ...current, email: value }))
              }}
              required
            />
          </label>
          <label className="admin-form-field">
            <span>Телефон</span>
            <input
              className={specialistModalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="text"
              value={specialistForm.phone}
              onChange={(event) => {
                const value = event.currentTarget.value
                setSpecialistForm((current) => ({ ...current, phone: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>Должность</span>
            <input
              className={specialistModalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="text"
              value={specialistForm.title}
              onChange={(event) => {
                const value = event.currentTarget.value
                setSpecialistForm((current) => ({ ...current, title: value }))
              }}
              required
            />
          </label>
          <label className="admin-form-field">
            <span>Описание профиля</span>
            <textarea
              className={specialistModalMode === 'edit' ? 'admin-inline-textarea' : undefined}
              rows={3}
              value={specialistForm.bio}
              onChange={(event) => {
                const value = event.currentTarget.value
                setSpecialistForm((current) => ({ ...current, bio: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>Ссылка на фото</span>
            <input
              className={specialistModalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="text"
              value={specialistForm.photoUrl}
              onChange={(event) => {
                const value = event.currentTarget.value
                setSpecialistForm((current) => ({ ...current, photoUrl: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>
              {specialistModalMode === 'create' ? 'Пароль (опционально)' : 'Новый пароль (опционально)'}
            </span>
            <input
              className={specialistModalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="password"
              value={specialistForm.password}
              onChange={(event) => {
                const value = event.currentTarget.value
                setSpecialistForm((current) => ({ ...current, password: value }))
              }}
            />
          </label>
          {specialistModalMode === 'create' ? (
            <p className="admin-inline-note">
              После создания отправим на email ссылку для самостоятельной установки пароля.
            </p>
          ) : null}
          <label className="admin-check-field">
            <input
              type="checkbox"
              checked={specialistForm.isActive}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setSpecialistForm((current) => ({ ...current, isActive: checked }))
              }}
            />
            <span>{specialistForm.isActive ? 'Специалист активен' : 'Скрыт в клиенте'}</span>
          </label>
          <div className="admin-modal__footer">
            <button className="admin-inline-btn" type="button" onClick={closeSpecialistModal}>
              Отмена
            </button>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="submit"
              disabled={isSubmittingSpecialist}
            >
              {isSubmittingSpecialist
                ? specialistModalMode === 'create'
                  ? 'Создаем...'
                  : 'Сохраняем...'
                : specialistModalMode === 'create'
                  ? 'Добавить специалиста'
                  : 'Сохранить'}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={isCustomServiceModalOpen}
        title={
          customServiceModalMode === 'create'
            ? 'Новая персональная услуга'
            : editingCustomService
              ? `Редактирование услуги: ${editingCustomService.title}`
              : 'Редактирование персональной услуги'
        }
        onClose={() => {
          if (isSavingCustomService) {
            return
          }
          closeCustomServiceModal()
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSaveCustomService(event)}>
          <label className="admin-form-field">
            <span>Категория</span>
            <select
              value={customServiceForm.categoryId}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, categoryId: value }))
              }}
              required
            >
              <option value="" disabled>
                Выберите категорию
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form-field">
            <span>Название услуги (базовое)</span>
            <input
              type="text"
              value={customServiceForm.title}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, title: value }))
              }}
              required
            />
          </label>
          <label className="admin-form-field">
            <span>Название (ru)</span>
            <input
              type="text"
              value={customServiceForm.titleRu}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, titleRu: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>Название (uk)</span>
            <input
              type="text"
              value={customServiceForm.titleUk}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, titleUk: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>Название (de)</span>
            <input
              type="text"
              value={customServiceForm.titleDe}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, titleDe: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>Описание (базовое)</span>
            <textarea
              rows={3}
              value={customServiceForm.description}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, description: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>Описание (ru)</span>
            <textarea
              rows={2}
              value={customServiceForm.descriptionRu}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, descriptionRu: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>Описание (uk)</span>
            <textarea
              rows={2}
              value={customServiceForm.descriptionUk}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, descriptionUk: value }))
              }}
            />
          </label>
          <label className="admin-form-field">
            <span>Описание (de)</span>
            <textarea
              rows={2}
              value={customServiceForm.descriptionDe}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, descriptionDe: value }))
              }}
            />
          </label>
          <div className="admin-service-form__row">
            <label className="admin-form-field">
              <span>Длительность (мин)</span>
              <input
                type="number"
                min={15}
                step={5}
                value={customServiceForm.duration}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setCustomServiceForm((current) => ({ ...current, duration: value }))
                }}
                required
              />
            </label>
            <label className="admin-form-field">
              <span>Цена</span>
              <input
                type="number"
                min={1}
                step={0.5}
                value={customServiceForm.price}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setCustomServiceForm((current) => ({ ...current, price: value }))
                }}
                required
              />
            </label>
          </div>
          <label className="admin-form-field">
            <span>Старая цена (опционально)</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={customServiceForm.oldPrice}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCustomServiceForm((current) => ({ ...current, oldPrice: value }))
              }}
            />
          </label>
          <label className="admin-check-field">
            <input
              type="checkbox"
              checked={customServiceForm.isActive}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setCustomServiceForm((current) => ({ ...current, isActive: checked }))
              }}
            />
            <span>
              {customServiceForm.isActive
                ? 'Показывать в каталоге специалиста'
                : 'Скрыто из каталога специалиста'}
            </span>
          </label>
          <button type="submit" disabled={isSavingCustomService || !selectedSpecialistId}>
            {isSavingCustomService
              ? customServiceModalMode === 'create'
                ? 'Создаем...'
                : 'Сохраняем...'
              : customServiceModalMode === 'create'
                ? 'Добавить персональную услугу'
                : 'Сохранить услугу'}
          </button>
        </form>
      </AdminModal>

      <ConfirmModal
        open={customServiceDeleteCandidate !== null}
        title="Удалить персональную услугу?"
        message={
          customServiceDeleteCandidate
            ? `Услуга «${customServiceDeleteCandidate.title}» будет удалена без возможности восстановления.`
            : ''
        }
        confirmLabel="Удалить"
        isLoading={deletingCustomServiceId !== null}
        onCancel={() => {
          if (deletingCustomServiceId !== null) {
            return
          }
          setCustomServiceDeleteCandidate(null)
        }}
        onConfirm={() => void handleDeleteCustomService()}
      />

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Удалить специалиста?"
        message={
          deleteCandidate
            ? `Специалист «${deleteCandidate.full_name}» будет удален без возможности восстановления.`
            : ''
        }
        confirmLabel="Удалить"
        isLoading={deletingId !== null}
        onCancel={() => {
          if (deletingId !== null) {
            return
          }
          setDeleteCandidate(null)
        }}
        onConfirm={() => void handleDeleteSpecialist()}
      />
    </section>
  )
}

export default SpecialistsPage
