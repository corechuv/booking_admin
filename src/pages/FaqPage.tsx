import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  type AdminI18nMap,
  ApiError,
  createAdminFaq,
  deleteAdminFaq,
  fetchAdminFaqs,
  fetchAdminLanguages,
  getStoredAdminToken,
  updateAdminFaq,
  type AdminFaq,
  type AdminLanguage,
} from '../api/backend-api'
import AdminI18nFields from '../components/AdminI18nFields'
import AdminModal from '../components/AdminModal'
import ConfirmModal from '../components/ConfirmModal'

type FaqFormState = {
  question: string
  questionI18n: AdminI18nMap
  answer: string
  answerI18n: AdminI18nMap
  sortOrder: string
  isActive: boolean
}

const emptyForm: FaqFormState = {
  question: '',
  questionI18n: null,
  answer: '',
  answerI18n: null,
  sortOrder: '0',
  isActive: true,
}

const bySortOrderAndId = (a: AdminFaq, b: AdminFaq): number =>
  a.sort_order - b.sort_order || a.id - b.id

const toDraft = (item: AdminFaq): FaqFormState => ({
  question: item.question,
  questionI18n: item.question_i18n,
  answer: item.answer,
  answerI18n: item.answer_i18n,
  sortOrder: String(item.sort_order),
  isActive: item.is_active,
})

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Ошибка при работе с FAQ.'
}

function FaqPage() {
  const [items, setItems] = useState<AdminFaq[]>([])
  const [languages, setLanguages] = useState<AdminLanguage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<FaqFormState>(emptyForm)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<AdminFaq | null>(null)

  const loadFaq = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const [nextFaq, nextLanguages] = await Promise.all([
        fetchAdminFaqs(token),
        fetchAdminLanguages(token),
      ])
      setItems(nextFaq.sort(bySortOrderAndId))
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
    void loadFaq()
  }, [loadFaq])

  const openCreateModal = () => {
    setModalMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setIsModalOpen(true)
  }

  const openEditModal = (item: AdminFaq) => {
    setModalMode('edit')
    setEditingId(item.id)
    setForm(toDraft(item))
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setEditingId(null)
    setForm(emptyForm)
    setIsModalOpen(false)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    const question = form.question.trim()
    const answer = form.answer.trim()
    if (!question || !answer) {
      setError('Вопрос и ответ обязательны.')
      return
    }

    if (modalMode === 'edit' && !editingId) {
      return
    }

    setIsSubmitting(true)
    if (modalMode === 'edit' && editingId) {
      setUpdatingId(editingId)
    }
    setError(null)
    try {
      if (modalMode === 'create') {
        const created = await createAdminFaq(token, {
          question,
          question_i18n: form.questionI18n,
          answer,
          answer_i18n: form.answerI18n,
          sort_order: Number.parseInt(form.sortOrder, 10) || 0,
          is_active: form.isActive,
        })
        setItems((current) => [...current, created].sort(bySortOrderAndId))
      } else {
        const updated = await updateAdminFaq(token, editingId!, {
          question,
          question_i18n: form.questionI18n,
          answer,
          answer_i18n: form.answerI18n,
          sort_order: Number.parseInt(form.sortOrder, 10) || 0,
          is_active: form.isActive,
        })
        setItems((current) =>
          current
            .map((row) => (row.id === editingId ? { ...row, ...updated } : row))
            .sort(bySortOrderAndId),
        )
      }
      closeModal()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
      setUpdatingId(null)
    }
  }

  const handleToggleActive = async (item: AdminFaq) => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setUpdatingId(item.id)
    setError(null)
    try {
      const updated = await updateAdminFaq(token, item.id, { is_active: !item.is_active })
      setItems((current) =>
        current
          .map((row) => (row.id === item.id ? { ...row, ...updated } : row))
          .sort(bySortOrderAndId),
      )
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
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
      await deleteAdminFaq(token, deleteCandidate.id)
      setItems((current) => current.filter((item) => item.id !== deleteCandidate.id))
      if (editingId === deleteCandidate.id) {
        closeModal()
      }
      setDeleteCandidate(null)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDeletingId(null)
    }
  }

  const editingItem =
    editingId === null ? null : items.find((item) => item.id === editingId) ?? null

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Управление FAQ</h1>
        <p>Добавление, редактирование и удаление вопросов.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Список FAQ</h2>
          <div className="admin-actions-cell">
            <span>{items.length} записей</span>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              onClick={openCreateModal}
            >
              Добавить FAQ
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Вопрос</th>
                <th>Ответ</th>
                <th>Переводы</th>
                <th>Порядок</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isBusy = updatingId === item.id || deletingId === item.id
                return (
                  <tr key={item.id}>
                    <td>{item.question}</td>
                    <td>{item.answer}</td>
                    <td>
                      Q:{' '}
                      {item.question_i18n ? Object.keys(item.question_i18n).length : 0}
                      {' / '}
                      A:{' '}
                      {item.answer_i18n ? Object.keys(item.answer_i18n).length : 0}
                    </td>
                    <td>{item.sort_order}</td>
                    <td>{item.is_active ? 'Активен' : 'Скрыт'}</td>
                    <td className="admin-actions-cell">
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(item)}
                      >
                        Изменить
                      </button>
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleActive(item)}
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!items.length && !isLoading ? (
          <p className="admin-inline-note">FAQ пока пустой.</p>
        ) : null}
      </article>

      <AdminModal
        open={isModalOpen}
        title={
          modalMode === 'create'
            ? 'Новый вопрос'
            : editingItem
              ? `Редактирование FAQ #${editingItem.id}`
              : 'Редактирование FAQ'
        }
        onClose={() => {
          if (isSubmitting) {
            return
          }
          closeModal()
        }}
      >
        <form className="admin-service-form" onSubmit={(event) => void handleSubmit(event)}>
          <input
            className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
            type="text"
            placeholder="Вопрос"
            value={form.question}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, question: value }))
            }}
            required
          />
          <textarea
            className={modalMode === 'edit' ? 'admin-inline-textarea' : undefined}
            rows={4}
            placeholder="Ответ"
            value={form.answer}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, answer: value }))
            }}
            required
          />
          {languages.length ? (
            <>
              <AdminI18nFields
                title="Переводы вопроса"
                languages={languages}
                value={form.questionI18n}
                onChange={(value) =>
                  setForm((current) => ({ ...current, questionI18n: value }))
                }
              />
              <AdminI18nFields
                title="Переводы ответа"
                languages={languages}
                value={form.answerI18n}
                onChange={(value) =>
                  setForm((current) => ({ ...current, answerI18n: value }))
                }
                multiline
                rows={3}
              />
            </>
          ) : null}
          <input
            className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
            type="number"
            placeholder="Порядок"
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
            <span>{form.isActive ? 'Активен' : 'Скрыт'}</span>
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
                  ? 'Добавить FAQ'
                  : 'Сохранить'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Удалить FAQ?"
        message={
          deleteCandidate
            ? `Вопрос «${deleteCandidate.question}» будет удален без возможности восстановления.`
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

export default FaqPage
