import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type AdminI18nMap,
  ApiError,
  createAdminService,
  deleteAdminService,
  fetchAdminCategories,
  fetchAdminLanguages,
  fetchAdminServices,
  getStoredAdminToken,
  updateAdminService,
  type AdminCategory,
  type AdminLanguage,
  type AdminService,
} from '../api/backend-api'
import AdminI18nFields from '../components/AdminI18nFields'
import AdminModal from '../components/AdminModal'
import ConfirmModal from '../components/ConfirmModal'
import { formatPrice } from '../lib/admin-format'

type ServiceFormState = {
  categoryId: string
  title: string
  titleI18n: AdminI18nMap
  description: string
  descriptionI18n: AdminI18nMap
  duration: string
  price: string
  oldPrice: string
  isActive: boolean
}

const emptyForm: ServiceFormState = {
  categoryId: '',
  title: '',
  titleI18n: null,
  description: '',
  descriptionI18n: null,
  duration: '',
  price: '',
  oldPrice: '',
  isActive: true,
}

const parsePrice = (value: number | string): number => {
  if (typeof value === 'number') {
    return value
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const parseOptionalPrice = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

const formatPriceInput = (value: number | string | null): string => {
  if (value === null) {
    return ''
  }
  const parsed = parsePrice(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ''
  }
  return Number.isInteger(parsed) ? parsed.toFixed(0) : parsed.toString()
}

const byCategoryAndTitle = (a: AdminService, b: AdminService): number => {
  if (a.category === b.category) {
    return a.title.localeCompare(b.title)
  }

  return a.category.localeCompare(b.category)
}

const byCategoryName = (a: AdminCategory, b: AdminCategory): number =>
  a.name.localeCompare(b.name)

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'Ошибка при работе с процедурами.'
}

function ServicesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [languages, setLanguages] = useState<AdminLanguage[]>([])
  const [services, setServices] = useState<AdminService[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<ServiceFormState>(emptyForm)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingServiceId, setUpdatingServiceId] = useState<number | null>(null)
  const [deletingServiceId, setDeletingServiceId] = useState<number | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<AdminService | null>(null)

  const loadCatalogData = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const [nextCategories, nextServices, nextLanguages] = await Promise.all([
        fetchAdminCategories(token),
        fetchAdminServices(token),
        fetchAdminLanguages(token),
      ])
      const orderedCategories = nextCategories.sort(byCategoryName)
      setServices(nextServices.sort(byCategoryAndTitle))
      setCategories(orderedCategories)
      setLanguages(
        nextLanguages
          .filter((item) => item.is_active)
          .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)),
      )
      setForm((currentForm) => {
        if (currentForm.categoryId || !orderedCategories.length) {
          return currentForm
        }
        return {
          ...currentForm,
          categoryId: String(orderedCategories[0].id),
        }
      })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalogData()
  }, [loadCatalogData])

  const serviceGroups = useMemo(
    () =>
      categories.map((category) => {
        const categoryServices = services.filter(
          (service) => service.category_id === category.id,
        )
        const activeCount = categoryServices.filter((service) => service.is_active).length
        const priceRange =
          categoryServices.length > 0
            ? `${formatPrice(
                Math.min(...categoryServices.map((service) => parsePrice(service.price))),
              )} - ${formatPrice(
                Math.max(...categoryServices.map((service) => parsePrice(service.price))),
              )}`
            : '—'

        return {
          name: category.name,
          count: `${categoryServices.length} процедур`,
          state: `${activeCount} активных`,
          priceRange,
        }
      }),
    [categories, services],
  )

  const editingService = useMemo(
    () =>
      editingServiceId === null
        ? null
        : services.find((service) => service.id === editingServiceId) ?? null,
    [services, editingServiceId],
  )

  const openCreateModal = () => {
    const defaultCategoryId = form.categoryId || String(categories[0]?.id ?? '')
    setModalMode('create')
    setEditingServiceId(null)
    setForm({
      ...emptyForm,
      categoryId: defaultCategoryId,
      isActive: true,
    })
    setIsModalOpen(true)
  }

  const openEditModal = (service: AdminService) => {
    setModalMode('edit')
    setEditingServiceId(service.id)
    setForm({
      categoryId: String(service.category_id),
      title: service.title,
      titleI18n: service.title_i18n,
      description: service.description ?? '',
      descriptionI18n: service.description_i18n,
      duration: String(service.duration_minutes),
      price: formatPriceInput(service.price),
      oldPrice: formatPriceInput(service.old_price),
      isActive: service.is_active,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setEditingServiceId(null)
    setIsModalOpen(false)
  }

  const handleSubmitService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const categoryId = Number.parseInt(form.categoryId, 10)
    const duration = Number.parseInt(form.duration, 10)
    const price = Number.parseFloat(form.price)
    const oldPrice = parseOptionalPrice(form.oldPrice)
    const title = form.title.trim()
    const description = form.description.trim()

    if (Number.isNaN(categoryId) || categoryId < 1) {
      setError('Сначала выберите категорию для процедуры.')
      return
    }

    if (title.length < 2) {
      setError('Название должно содержать минимум 2 символа.')
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

    if (oldPrice !== null && oldPrice <= price) {
      setError('Старая цена должна быть больше текущей цены.')
      return
    }

    if (modalMode === 'edit' && !editingServiceId) {
      return
    }

    setIsSubmitting(true)
    if (modalMode === 'edit' && editingServiceId) {
      setUpdatingServiceId(editingServiceId)
    }
    setError(null)

    try {
      if (modalMode === 'create') {
        await createAdminService(token, {
          category_id: categoryId,
          title,
          title_i18n: form.titleI18n,
          description: description || null,
          description_i18n: form.descriptionI18n,
          duration_minutes: duration,
          price,
          old_price: oldPrice,
          is_active: form.isActive,
        })
      } else {
        await updateAdminService(token, editingServiceId!, {
          category_id: categoryId,
          title,
          title_i18n: form.titleI18n,
          description: description || null,
          description_i18n: form.descriptionI18n,
          duration_minutes: duration,
          price,
          old_price: oldPrice,
          is_active: form.isActive,
        })
      }

      await loadCatalogData()
      closeModal()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
      setUpdatingServiceId(null)
    }
  }

  const handleToggleService = async (service: AdminService) => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setUpdatingServiceId(service.id)
    setError(null)

    try {
      await updateAdminService(token, service.id, {
        is_active: !service.is_active,
      })
      await loadCatalogData()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setUpdatingServiceId(null)
    }
  }

  const handleDeleteService = async () => {
    if (!deleteCandidate) {
      return
    }

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setDeletingServiceId(deleteCandidate.id)
    setError(null)

    try {
      await deleteAdminService(token, deleteCandidate.id)
      await loadCatalogData()
      if (editingServiceId === deleteCandidate.id) {
        closeModal()
      }
      setDeleteCandidate(null)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDeletingServiceId(null)
    }
  }

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Управление процедурами</h1>
        <p>Категории вынесены в отдельный раздел.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <div className="admin-page-actions">
        <Link className="admin-inline-btn" to="/categories">
          Открыть категории
        </Link>
        <button
          className="admin-inline-btn admin-inline-btn--accent"
          type="button"
          onClick={openCreateModal}
          disabled={!categories.length}
        >
          Добавить услугу
        </button>
      </div>

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Категории услуг</h2>
          <span>{serviceGroups.length} категории</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table admin-table--categories-summary">
            <thead>
              <tr>
                <th>Категория</th>
                <th>Услуг</th>
                <th>Статус</th>
                <th>Диапазон цен</th>
              </tr>
            </thead>
            <tbody>
              {serviceGroups.map((group) => (
                <tr key={group.name}>
                  <td>{group.name}</td>
                  <td>{group.count}</td>
                  <td>{group.state}</td>
                  <td>{group.priceRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!serviceGroups.length && !isLoading ? (
          <p className="admin-inline-note">Категории не найдены. Сначала добавьте их.</p>
        ) : null}
      </article>

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Прайс-лист</h2>
          <span>{services.length} услуг</span>
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
              {services.map((row) => {
                const isUpdating = updatingServiceId === row.id
                const isDeleting = deletingServiceId === row.id

                return (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{row.category}</td>
                    <td>{row.duration_minutes} мин</td>
                    <td>
                      <div className="admin-price-stack">
                        {row.old_price ? (
                          <span className="admin-price-old">{formatPrice(row.old_price)}</span>
                        ) : null}
                        <strong>{formatPrice(row.price)}</strong>
                        {row.discount_percent ? (
                          <span className="admin-price-badge">-{row.discount_percent}%</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{row.is_active ? 'Активна' : 'Скрыта'}</td>
                    <td className="admin-actions-cell">
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isUpdating || isDeleting}
                        onClick={() => openEditModal(row)}
                      >
                        Изменить
                      </button>
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isUpdating || isDeleting}
                        onClick={() => void handleToggleService(row)}
                      >
                        {isUpdating
                          ? 'Обновляем...'
                          : row.is_active
                            ? 'Скрыть'
                            : 'Активировать'}
                      </button>
                      <button
                        className="admin-inline-btn is-danger"
                        type="button"
                        disabled={isUpdating || isDeleting}
                        onClick={() => setDeleteCandidate(row)}
                      >
                        {isDeleting ? 'Удаляем...' : 'Удалить'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!services.length && !isLoading ? (
          <p className="admin-inline-note">Список услуг пуст.</p>
        ) : null}
      </article>

      <AdminModal
        open={isModalOpen}
        title={
          modalMode === 'create'
            ? 'Новая услуга'
            : editingService
              ? `Редактирование: ${editingService.title}`
              : 'Редактирование услуги'
        }
        onClose={() => {
          if (isSubmitting) {
            return
          }
          closeModal()
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSubmitService(event)}>
          <select
            value={form.categoryId}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((currentForm) => ({ ...currentForm, categoryId: value }))
            }}
            disabled={!categories.length}
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
          <input
            className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
            type="text"
            placeholder="Название"
            value={form.title}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((currentForm) => ({ ...currentForm, title: value }))
            }}
            required
          />
          <textarea
            className={modalMode === 'edit' ? 'admin-inline-textarea' : undefined}
            placeholder="Описание"
            rows={3}
            value={form.description}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((currentForm) => ({ ...currentForm, description: value }))
            }}
          />
          {languages.length ? (
            <>
              <AdminI18nFields
                title={
                  modalMode === 'create'
                    ? 'Переводы названия услуги'
                    : 'Переводы названия'
                }
                languages={languages}
                value={form.titleI18n}
                onChange={(value) =>
                  setForm((currentForm) => ({ ...currentForm, titleI18n: value }))
                }
              />
              <AdminI18nFields
                title={
                  modalMode === 'create'
                    ? 'Переводы описания услуги'
                    : 'Переводы описания'
                }
                languages={languages}
                value={form.descriptionI18n}
                onChange={(value) =>
                  setForm((currentForm) => ({ ...currentForm, descriptionI18n: value }))
                }
                multiline
                rows={3}
              />
            </>
          ) : (
            <p className="admin-inline-note">Активные языки не найдены.</p>
          )}
          <div className="admin-service-form__row">
            <input
              type="number"
              min={15}
              step={5}
              placeholder="Минуты"
              value={form.duration}
              onChange={(event) => {
                const value = event.currentTarget.value
                setForm((currentForm) => ({ ...currentForm, duration: value }))
              }}
              required
            />
            <input
              type="number"
              min={1}
              step={0.5}
              placeholder="Цена"
              value={form.price}
              onChange={(event) => {
                const value = event.currentTarget.value
                setForm((currentForm) => ({ ...currentForm, price: value }))
              }}
              required
            />
          </div>
          <input
            type="number"
            min={1}
            step={0.5}
            placeholder="Старая цена (опционально)"
            value={form.oldPrice}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((currentForm) => ({ ...currentForm, oldPrice: value }))
            }}
          />
          <label className="admin-check-field">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setForm((currentForm) => ({ ...currentForm, isActive: checked }))
              }}
            />
            <span>
              {form.isActive ? 'Показывать в каталоге' : 'Скрыто из каталога'}
            </span>
          </label>
          <div className="admin-modal__footer">
            <button className="admin-inline-btn" type="button" onClick={closeModal}>
              Отмена
            </button>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="submit"
              disabled={isSubmitting || !categories.length}
            >
              {isSubmitting
                ? modalMode === 'create'
                  ? 'Создаем...'
                  : 'Сохраняем...'
                : modalMode === 'create'
                  ? 'Добавить услугу'
                  : 'Сохранить'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Удалить услугу?"
        message={
          deleteCandidate
            ? `Услуга «${deleteCandidate.title}» будет удалена без возможности восстановления.`
            : ''
        }
        confirmLabel="Удалить"
        isLoading={deletingServiceId !== null}
        onCancel={() => {
          if (deletingServiceId !== null) {
            return
          }
          setDeleteCandidate(null)
        }}
        onConfirm={() => void handleDeleteService()}
      />
    </section>
  )
}

export default ServicesPage
