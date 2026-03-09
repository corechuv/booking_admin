import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AdminI18nMap,
  ApiError,
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
  fetchAdminLanguages,
  fetchAdminServices,
  getStoredAdminToken,
  updateAdminCategory,
  type AdminCategory,
  type AdminLanguage,
  type AdminService,
} from '../api/backend-api'
import AdminI18nFields from '../components/AdminI18nFields'
import AdminModal from '../components/AdminModal'
import ConfirmModal from '../components/ConfirmModal'

type CategoryFormState = {
  name: string
  nameI18n: AdminI18nMap
  description: string
  descriptionI18n: AdminI18nMap
  isActive: boolean
}

const emptyCategoryForm: CategoryFormState = {
  name: '',
  nameI18n: null,
  description: '',
  descriptionI18n: null,
  isActive: true,
}

const byCategoryName = (a: AdminCategory, b: AdminCategory): number =>
  a.name.localeCompare(b.name)

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'Ошибка при работе с категориями.'
}

const toDraft = (category: AdminCategory): CategoryFormState => ({
  name: category.name,
  nameI18n: category.name_i18n,
  description: category.description ?? '',
  descriptionI18n: category.description_i18n,
  isActive: category.is_active,
})

function CategoriesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [services, setServices] = useState<AdminService[]>([])
  const [languages, setLanguages] = useState<AdminLanguage[]>([])

  const [form, setForm] = useState<CategoryFormState>(emptyCategoryForm)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<AdminCategory | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingCategoryId, setUpdatingCategoryId] = useState<number | null>(null)
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null)

  const loadData = useCallback(async () => {
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
      setCategories(nextCategories.sort(byCategoryName))
      setServices(nextServices)
      setLanguages(
        nextLanguages
          .filter((item) => item.is_active)
          .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)),
      )
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const servicesCountByCategoryId = useMemo(() => {
    const counter = new Map<number, number>()
    services.forEach((service) => {
      counter.set(service.category_id, (counter.get(service.category_id) ?? 0) + 1)
    })
    return counter
  }, [services])

  const openCreateModal = () => {
    setModalMode('create')
    setEditingCategoryId(null)
    setForm(emptyCategoryForm)
    setIsModalOpen(true)
  }

  const openEditModal = (category: AdminCategory) => {
    setModalMode('edit')
    setEditingCategoryId(category.id)
    setForm(toDraft(category))
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setEditingCategoryId(null)
    setForm(emptyCategoryForm)
    setIsModalOpen(false)
  }

  const handleSubmitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const name = form.name.trim()
    if (name.length < 2) {
      setError('Название категории должно быть не меньше 2 символов.')
      return
    }

    if (modalMode === 'edit' && !editingCategoryId) {
      return
    }

    setIsSubmitting(true)
    if (modalMode === 'edit' && editingCategoryId) {
      setUpdatingCategoryId(editingCategoryId)
    }
    setError(null)

    try {
      if (modalMode === 'create') {
        const created = await createAdminCategory(token, {
          name,
          name_i18n: form.nameI18n,
          description: form.description.trim() || null,
          description_i18n: form.descriptionI18n,
          is_active: form.isActive,
        })
        setCategories((currentCategories) =>
          [...currentCategories, created].sort(byCategoryName),
        )
      } else {
        const updated = await updateAdminCategory(token, editingCategoryId!, {
          name,
          name_i18n: form.nameI18n,
          description: form.description.trim() || null,
          description_i18n: form.descriptionI18n,
          is_active: form.isActive,
        })

        setCategories((currentCategories) =>
          currentCategories
            .map((category) =>
              category.id === editingCategoryId ? { ...category, ...updated } : category,
            )
            .sort(byCategoryName),
        )
      }
      closeModal()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
      setUpdatingCategoryId(null)
    }
  }

  const handleDeleteCategory = async () => {
    if (!deleteCandidate) {
      return
    }

    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setDeletingCategoryId(deleteCandidate.id)
    setError(null)
    try {
      await deleteAdminCategory(token, deleteCandidate.id)
      setCategories((currentCategories) =>
        currentCategories.filter((category) => category.id !== deleteCandidate.id),
      )
      if (editingCategoryId === deleteCandidate.id) {
        closeModal()
      }
      setDeleteCandidate(null)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDeletingCategoryId(null)
    }
  }

  const handleToggleCategory = async (category: AdminCategory) => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setUpdatingCategoryId(category.id)
    setError(null)

    try {
      const updated = await updateAdminCategory(token, category.id, {
        is_active: !category.is_active,
      })
      setCategories((currentCategories) =>
        currentCategories
          .map((currentCategory) =>
            currentCategory.id === category.id
              ? { ...currentCategory, ...updated }
              : currentCategory,
          )
          .sort(byCategoryName),
      )
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setUpdatingCategoryId(null)
    }
  }

  const editingCategory =
    editingCategoryId === null
      ? null
      : categories.find((category) => category.id === editingCategoryId) ?? null

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Управление категориями</h1>
        <p>Создание, редактирование и удаление категорий каталога.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Список категорий</h2>
          <div className="admin-actions-cell">
            <span>{categories.length} записей</span>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              onClick={openCreateModal}
            >
              Добавить категорию
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Категория</th>
                <th>Описание</th>
                <th>Услуг</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const linkedServicesCount = servicesCountByCategoryId.get(category.id) ?? 0
                const isUpdating = updatingCategoryId === category.id
                const isDeleting = deletingCategoryId === category.id
                const isBusy = isUpdating || isDeleting

                return (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td>{category.description || '—'}</td>
                    <td>{linkedServicesCount}</td>
                    <td>
                      <span className="admin-status">
                        {category.is_active ? 'Активна' : 'Скрыта'}
                      </span>
                    </td>
                    <td className="admin-actions-cell">
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(category)}
                      >
                        Изменить
                      </button>
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleCategory(category)}
                      >
                        {isUpdating
                          ? 'Обновляем...'
                          : category.is_active
                            ? 'Скрыть'
                            : 'Активировать'}
                      </button>
                      <button
                        className="admin-inline-btn is-danger"
                        type="button"
                        disabled={isBusy || linkedServicesCount > 0}
                        title={
                          linkedServicesCount > 0
                            ? 'Сначала удалите или перенесите услуги из этой категории.'
                            : undefined
                        }
                        onClick={() => setDeleteCandidate(category)}
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

        {!categories.length && !isLoading ? (
          <p className="admin-inline-note">Категории пока не добавлены.</p>
        ) : null}
      </article>

      <AdminModal
        open={isModalOpen}
        title={
          modalMode === 'create'
            ? 'Новая категория'
            : editingCategory
              ? `Редактирование: ${editingCategory.name}`
              : 'Редактирование категории'
        }
        onClose={() => {
          if (isSubmitting) {
            return
          }
          closeModal()
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSubmitCategory(event)}>
          <input
            type="text"
            placeholder="Название категории"
            value={form.name}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((currentForm) => ({ ...currentForm, name: value }))
            }}
            required
          />
          <textarea
            placeholder="Описание категории (опционально)"
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
                    ? 'Переводы названия категории'
                    : 'Переводы названия'
                }
                languages={languages}
                value={form.nameI18n}
                onChange={(value) =>
                  setForm((currentForm) => ({ ...currentForm, nameI18n: value }))
                }
              />
              <AdminI18nFields
                title={
                  modalMode === 'create'
                    ? 'Переводы описания категории'
                    : 'Переводы описания'
                }
                languages={languages}
                value={form.descriptionI18n}
                onChange={(value) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    descriptionI18n: value,
                  }))
                }
                multiline
                rows={3}
              />
            </>
          ) : null}
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
              {modalMode === 'create'
                ? 'Сразу активировать категорию'
                : form.isActive
                  ? 'Активна'
                  : 'Скрыта'}
            </span>
          </label>
          <div className="admin-modal__footer">
            <button className="admin-inline-btn" type="button" onClick={closeModal}>
              Отмена
            </button>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? modalMode === 'create'
                  ? 'Создаем...'
                  : 'Сохраняем...'
                : modalMode === 'create'
                  ? 'Добавить категорию'
                  : 'Сохранить'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Удалить категорию?"
        message={
          deleteCandidate
            ? `Категория «${deleteCandidate.name}» будет удалена без возможности восстановления.`
            : ''
        }
        confirmLabel="Удалить"
        isLoading={deletingCategoryId !== null}
        onCancel={() => {
          if (deletingCategoryId !== null) {
            return
          }
          setDeleteCandidate(null)
        }}
        onConfirm={() => void handleDeleteCategory()}
      />
    </section>
  )
}

export default CategoriesPage
