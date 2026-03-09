import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  createAdminLanguage,
  deleteAdminLanguage,
  fetchAdminLanguages,
  getStoredAdminToken,
  updateAdminLanguage,
  type AdminLanguage,
} from '../api/backend-api'
import AdminModal from '../components/AdminModal'
import ConfirmModal from '../components/ConfirmModal'

type LanguageFormState = {
  code: string
  name: string
  sortOrder: string
  isActive: boolean
  isDefault: boolean
}

const emptyForm: LanguageFormState = {
  code: '',
  name: '',
  sortOrder: '0',
  isActive: true,
  isDefault: false,
}

const toDraft = (language: AdminLanguage): LanguageFormState => ({
  code: language.code,
  name: language.name,
  sortOrder: String(language.sort_order),
  isActive: language.is_active,
  isDefault: language.is_default,
})

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Ошибка при работе с языками.'
}

function LanguagesPage() {
  const [languages, setLanguages] = useState<AdminLanguage[]>([])

  const [form, setForm] = useState<LanguageFormState>(emptyForm)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingLanguageId, setEditingLanguageId] = useState<number | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<AdminLanguage | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadLanguages = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const nextLanguages = await fetchAdminLanguages(token)
      const ordered = nextLanguages.sort(
        (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code),
      )
      setLanguages(ordered)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLanguages()
  }, [loadLanguages])

  const defaultLanguageCode = useMemo(
    () => languages.find((item) => item.is_default)?.code ?? '—',
    [languages],
  )

  const openCreateModal = () => {
    setModalMode('create')
    setEditingLanguageId(null)
    setForm(emptyForm)
    setIsModalOpen(true)
  }

  const openEditModal = (language: AdminLanguage) => {
    setModalMode('edit')
    setEditingLanguageId(language.id)
    setForm(toDraft(language))
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setEditingLanguageId(null)
    setForm(emptyForm)
    setIsModalOpen(false)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const code = form.code.trim().toLowerCase()
    const name = form.name.trim()
    if (!code || !name) {
      setError('Код и название языка обязательны.')
      return
    }

    if (modalMode === 'edit' && !editingLanguageId) {
      return
    }

    setIsSubmitting(true)
    if (modalMode === 'edit' && editingLanguageId) {
      setUpdatingId(editingLanguageId)
    }
    setError(null)
    try {
      if (modalMode === 'create') {
        await createAdminLanguage(token, {
          code,
          name,
          sort_order: Number.parseInt(form.sortOrder, 10) || 0,
          is_active: form.isActive,
          is_default: form.isDefault,
        })
      } else {
        await updateAdminLanguage(token, editingLanguageId!, {
          code,
          name,
          sort_order: Number.parseInt(form.sortOrder, 10) || 0,
          is_active: form.isActive,
          is_default: form.isDefault,
        })
      }
      closeModal()
      await loadLanguages()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
      setUpdatingId(null)
    }
  }

  const handleDelete = async () => {
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
      await deleteAdminLanguage(token, deleteCandidate.id)
      setDeleteCandidate(null)
      if (editingLanguageId === deleteCandidate.id) {
        closeModal()
      }
      await loadLanguages()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDeletingId(null)
    }
  }

  const editingLanguage =
    editingLanguageId === null
      ? null
      : languages.find((item) => item.id === editingLanguageId) ?? null

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Управление языками</h1>
        <p>Языки клиента и админ-переводов.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Список языков</h2>
          <div className="admin-actions-cell">
            <span>Default: {defaultLanguageCode}</span>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              onClick={openCreateModal}
            >
              Добавить язык
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Название</th>
                <th>Порядок</th>
                <th>Активен</th>
                <th>Default</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {languages.map((language) => {
                const isBusy = updatingId === language.id || deletingId === language.id
                return (
                  <tr key={language.id}>
                    <td>{language.code}</td>
                    <td>{language.name}</td>
                    <td>{language.sort_order}</td>
                    <td>{language.is_active ? 'Да' : 'Нет'}</td>
                    <td>{language.is_default ? 'Да' : 'Нет'}</td>
                    <td className="admin-actions-cell">
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(language)}
                      >
                        Изменить
                      </button>
                      <button
                        className="admin-inline-btn is-danger"
                        type="button"
                        disabled={isBusy}
                        onClick={() => setDeleteCandidate(language)}
                      >
                        {deletingId === language.id ? 'Удаляем...' : 'Удалить'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!languages.length && !isLoading ? (
          <p className="admin-inline-note">Языки пока не добавлены.</p>
        ) : null}
      </article>

      <AdminModal
        open={isModalOpen}
        title={
          modalMode === 'create'
            ? 'Новый язык'
            : editingLanguage
              ? `Редактирование: ${editingLanguage.code}`
              : 'Редактирование языка'
        }
        onClose={() => {
          if (isSubmitting) {
            return
          }
          closeModal()
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="admin-service-form__row">
            <input
              className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="text"
              placeholder="Код (ru, uk, de)"
              value={form.code}
              onChange={(event) => {
                const value = event.currentTarget.value
                setForm((current) => ({ ...current, code: value }))
              }}
              required
            />
            <input
              className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="text"
              placeholder="Название языка"
              value={form.name}
              onChange={(event) => {
                const value = event.currentTarget.value
                setForm((current) => ({ ...current, name: value }))
              }}
              required
            />
          </div>
          <input
            className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
            type="number"
            placeholder="Порядок сортировки"
            value={form.sortOrder}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, sortOrder: value }))
            }}
          />
          <label className="admin-check-field">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setForm((current) => ({ ...current, isActive: checked }))
              }}
            />
            <span>{modalMode === 'create' ? 'Активный язык' : 'Язык активен'}</span>
          </label>
          <label className="admin-check-field">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setForm((current) => ({ ...current, isDefault: checked }))
              }}
            />
            <span>
              {modalMode === 'create'
                ? 'Сделать языком по умолчанию'
                : 'Язык по умолчанию'}
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
                  ? 'Добавить язык'
                  : 'Сохранить'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Удалить язык?"
        message={
          deleteCandidate
            ? `Язык «${deleteCandidate.name}» будет удален без возможности восстановления.`
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
        onConfirm={() => void handleDelete()}
      />
    </section>
  )
}

export default LanguagesPage
