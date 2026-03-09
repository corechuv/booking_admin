import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  createAdminCertificate,
  deleteAdminCertificate,
  fetchAdminCertificates,
  getStoredAdminToken,
  updateAdminCertificate,
  type AdminCertificate,
} from '../api/backend-api'
import AdminModal from '../components/AdminModal'
import ConfirmModal from '../components/ConfirmModal'

type CertificateFormState = {
  title: string
  imageUrl: string
  documentUrl: string
  description: string
  sortOrder: string
}

const emptyForm: CertificateFormState = {
  title: '',
  imageUrl: '',
  documentUrl: '',
  description: '',
  sortOrder: '0',
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Ошибка при работе с сертификатами.'
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Не удалось прочитать файл'))
    }
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })

function CertificatesPage() {
  const [items, setItems] = useState<AdminCertificate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<CertificateFormState>(emptyForm)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<AdminCertificate | null>(null)

  const loadCertificates = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const next = await fetchAdminCertificates(token)
      setItems(next)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCertificates()
  }, [loadCertificates])

  const toPayload = (value: CertificateFormState) => ({
    title: value.title.trim(),
    image_url: value.imageUrl.trim() || null,
    document_url: value.documentUrl.trim() || null,
    description: value.description.trim() || null,
    sort_order: Number.parseInt(value.sortOrder, 10) || 0,
  })

  const openCreateModal = () => {
    setModalMode('create')
    setEditingId(null)
    setForm(emptyForm)
    setIsModalOpen(true)
  }

  const openEditModal = (item: AdminCertificate) => {
    setModalMode('edit')
    setEditingId(item.id)
    setForm({
      title: item.title,
      imageUrl: item.image_url ?? '',
      documentUrl: item.document_url ?? '',
      description: item.description ?? '',
      sortOrder: String(item.sort_order),
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setEditingId(null)
    setForm(emptyForm)
    setIsModalOpen(false)
  }

  const applyImageFile = (file?: File) => {
    if (!file) {
      return
    }
    void (async () => {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        setForm((current) => ({ ...current, imageUrl: dataUrl }))
      } catch (requestError) {
        setError(getErrorMessage(requestError))
      }
    })()
  }

  const applyDocumentFile = (file?: File) => {
    if (!file) {
      return
    }
    void (async () => {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        setForm((current) => ({ ...current, documentUrl: dataUrl }))
      } catch (requestError) {
        setError(getErrorMessage(requestError))
      }
    })()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token) {
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
        const created = await createAdminCertificate(token, {
          ...toPayload(form),
          is_active: true,
        })
        setItems((current) => [...current, created])
      } else {
        const updated = await updateAdminCertificate(token, editingId!, toPayload(form))
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

  const handleToggleActive = async (item: AdminCertificate) => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setUpdatingId(item.id)
    setError(null)
    try {
      const updated = await updateAdminCertificate(token, item.id, {
        is_active: !item.is_active,
      })
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
      await deleteAdminCertificate(token, deleteCandidate.id)
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
        <h1>Управление сертификатами</h1>
        <p>Добавление, редактирование и удаление сертификатов.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Список сертификатов</h2>
          <div className="admin-actions-cell">
            <span>{items.length} записей</span>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              onClick={openCreateModal}
            >
              Добавить сертификат
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Файлы</th>
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
                    <td>{item.title}</td>
                    <td>
                      <div className="admin-file-links">
                        {item.image_url ? (
                          <a href={item.image_url} target="_blank" rel="noreferrer">
                            Превью
                          </a>
                        ) : null}
                        {item.document_url ? (
                          <a href={item.document_url} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        ) : null}
                        {!item.image_url && !item.document_url ? '—' : null}
                      </div>
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
          <p className="admin-inline-note">Сертификаты пока не добавлены.</p>
        ) : null}
      </article>

      <AdminModal
        open={isModalOpen}
        title={
          modalMode === 'create'
            ? 'Новый сертификат'
            : editingItem
              ? `Редактирование: ${editingItem.title}`
              : 'Редактирование сертификата'
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
            placeholder="Название"
            value={form.title}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, title: value }))
            }}
            required
          />
          <input
            className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
            type="text"
            placeholder="Ссылка на изображение"
            value={form.imageUrl}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, imageUrl: value }))
            }}
          />
          <label className="admin-file-tools">
            <span>Загрузить превью (jpg/png/webp)</span>
            <input
              className="admin-file-input"
              type="file"
              accept="image/*"
              onChange={(event) => applyImageFile(event.currentTarget.files?.[0])}
            />
          </label>
          <input
            className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
            type="text"
            placeholder="Ссылка на PDF/документ"
            value={form.documentUrl}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, documentUrl: value }))
            }}
          />
          <label className="admin-file-tools">
            <span>Загрузить PDF сертификат</span>
            <input
              className="admin-file-input"
              type="file"
              accept="application/pdf"
              onChange={(event) => applyDocumentFile(event.currentTarget.files?.[0])}
            />
          </label>
          <textarea
            className={modalMode === 'edit' ? 'admin-inline-textarea' : undefined}
            rows={3}
            placeholder="Описание"
            value={form.description}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, description: value }))
            }}
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
                  ? 'Добавить сертификат'
                  : 'Сохранить'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Удалить сертификат?"
        message={
          deleteCandidate
            ? `Сертификат «${deleteCandidate.title}» будет удален без возможности восстановления.`
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

export default CertificatesPage
