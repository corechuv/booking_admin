import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  createAdminFaq,
  deleteAdminFaq,
  fetchAdminFaqs,
  getStoredAdminToken,
  updateAdminFaq,
  type AdminFaq,
} from '../api/backend-api'
import AdminModal from '../components/AdminModal'
import ConfirmModal from '../components/ConfirmModal'

type FaqFormState = {
  question: string
  answer: string
  sortOrder: string
}

const emptyForm: FaqFormState = {
  question: '',
  answer: '',
  sortOrder: '0',
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Ошибка при работе с FAQ.'
}

function FaqPage() {
  const [items, setItems] = useState<AdminFaq[]>([])
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
      const next = await fetchAdminFaqs(token)
      setItems(next)
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
    setForm({
      question: item.question,
      answer: item.answer,
      sortOrder: String(item.sort_order),
    })
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
          answer,
          sort_order: Number.parseInt(form.sortOrder, 10) || 0,
          is_active: true,
        })
        setItems((current) => [...current, created])
      } else {
        const updated = await updateAdminFaq(token, editingId!, {
          question,
          answer,
          sort_order: Number.parseInt(form.sortOrder, 10) || 0,
        })
        setItems((current) =>
          current.map((row) => (row.id === editingId ? { ...row, ...updated } : row)),
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
        current.map((row) => (row.id === item.id ? { ...row, ...updated } : row)),
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
