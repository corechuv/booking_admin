import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  getStoredAdminToken,
  isSuperAdminRole,
  updateAdminUser,
  type AuthUser,
  type AdminUser,
} from '../api/backend-api'
import AdminModal from '../components/AdminModal'
import ConfirmModal from '../components/ConfirmModal'

type AdminUserFormState = {
  fullName: string
  email: string
  phone: string
  password: string
  role: 'admin' | 'super_admin'
  isActive: boolean
}

const emptyForm: AdminUserFormState = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  role: 'admin',
  isActive: true,
}

const toDraft = (user: AdminUser): AdminUserFormState => ({
  fullName: user.full_name,
  email: user.email,
  phone: user.phone ?? '',
  password: '',
  role: user.role,
  isActive: user.is_active,
})

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Ошибка при работе с админами.'
}

type AdminUsersPageProps = {
  currentUser: AuthUser
}

function AdminUsersPage({ currentUser }: AdminUsersPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([])

  const [form, setForm] = useState<AdminUserFormState>(emptyForm)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<AdminUser | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadUsers = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const next = await fetchAdminUsers(token)
      setUsers(next)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const canManageSuperAdmins = isSuperAdminRole(currentUser.role)

  const counts = useMemo(() => {
    const admins = users.filter((item) => item.role === 'admin').length
    const superAdmins = users.filter((item) => item.role === 'super_admin').length
    return { admins, superAdmins }
  }, [users])

  const openCreateModal = () => {
    setModalMode('create')
    setEditingId(null)
    setForm({
      ...emptyForm,
      role: canManageSuperAdmins ? emptyForm.role : 'admin',
    })
    setIsModalOpen(true)
  }

  const openEditModal = (user: AdminUser) => {
    setModalMode('edit')
    setEditingId(user.id)
    setForm(toDraft(user))
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

    if (modalMode === 'edit' && !editingId) {
      return
    }

    const fullName = form.fullName.trim()
    const email = form.email.trim().toLowerCase()
    const phone = form.phone.trim() || null
    const password = form.password.trim()

    if (!fullName || !email) {
      setError('Имя и email обязательны.')
      return
    }

    setIsSubmitting(true)
    if (modalMode === 'edit') {
      setUpdatingId(editingId)
    }
    setError(null)

    try {
      if (modalMode === 'create') {
        await createAdminUser(token, {
          full_name: fullName,
          email,
          phone,
          password: password || undefined,
          send_invite: true,
          role: canManageSuperAdmins ? form.role : 'admin',
          is_active: form.isActive,
        })
      } else {
        await updateAdminUser(token, editingId!, {
          full_name: fullName,
          email,
          phone,
          password: password || undefined,
          role: canManageSuperAdmins ? form.role : 'admin',
          is_active: form.isActive,
        })
      }
      closeModal()
      await loadUsers()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
      setUpdatingId(null)
    }
  }

  const handleToggleActive = async (user: AdminUser) => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setUpdatingId(user.id)
    setError(null)
    try {
      await updateAdminUser(token, user.id, { is_active: !user.is_active })
      await loadUsers()
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
      await deleteAdminUser(token, deleteCandidate.id)
      setDeleteCandidate(null)
      if (editingId === deleteCandidate.id) {
        closeModal()
      }
      await loadUsers()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setDeletingId(null)
    }
  }

  const editingUser =
    editingId === null ? null : users.find((item) => item.id === editingId) ?? null

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Управление админами</h1>
        <p>Доступы и статусы административных аккаунтов.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Список админов</h2>
          <div className="admin-actions-cell">
            <span>{canManageSuperAdmins ? `Аккаунтов: ${users.length}` : `Админов: ${counts.admins}`}</span>
            <button
              className="admin-inline-btn admin-inline-btn--accent"
              type="button"
              onClick={openCreateModal}
            >
              Добавить админа
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Email</th>
                {canManageSuperAdmins ? <th>Роль</th> : null}
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isBusy = updatingId === user.id || deletingId === user.id

                return (
                  <tr key={user.id}>
                    <td>{user.full_name}</td>
                    <td>{user.email}</td>
                    {canManageSuperAdmins ? (
                      <td>{user.role === 'super_admin' ? 'super_admin' : 'admin'}</td>
                    ) : null}
                    <td>{user.is_active ? 'Активен' : 'Отключен'}</td>
                    <td className="admin-actions-cell">
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(user)}
                      >
                        Изменить
                      </button>
                      <button
                        className="admin-inline-btn"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleActive(user)}
                      >
                        {updatingId === user.id
                          ? 'Обновляем...'
                          : user.is_active
                            ? 'Отключить'
                            : 'Активировать'}
                      </button>
                      <button
                        className="admin-inline-btn is-danger"
                        type="button"
                        disabled={isBusy}
                        onClick={() => setDeleteCandidate(user)}
                      >
                        {deletingId === user.id ? 'Удаляем...' : 'Удалить'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!users.length && !isLoading ? (
          <p className="admin-inline-note">Админы пока не добавлены.</p>
        ) : null}
      </article>

      <AdminModal
        open={isModalOpen}
        title={
          modalMode === 'create'
            ? 'Новый админ'
            : editingUser
              ? `Редактирование: ${editingUser.full_name}`
              : 'Редактирование админа'
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
            placeholder="Имя"
            value={form.fullName}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, fullName: value }))
            }}
            required
          />
          <input
            className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, email: value }))
            }}
            required
          />
          <input
            className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
            type="text"
            placeholder="Телефон"
            value={form.phone}
            onChange={(event) => {
              const value = event.currentTarget.value
              setForm((current) => ({ ...current, phone: value }))
            }}
          />
          <div className="admin-service-form__row">
            {canManageSuperAdmins ? (
              <select
                value={form.role}
                onChange={(event) => {
                  const value = event.currentTarget.value as AdminUserFormState['role']
                  setForm((current) => ({
                    ...current,
                    role: value,
                  }))
                }}
              >
                <option value="admin">admin</option>
                <option value="super_admin">super_admin</option>
              </select>
            ) : (
              <input value="admin" readOnly />
            )}
            <input
              className={modalMode === 'edit' ? 'admin-inline-input' : undefined}
              type="password"
              placeholder={modalMode === 'create' ? 'Пароль' : 'Новый пароль (опционально)'}
              value={form.password}
              onChange={(event) => {
                const value = event.currentTarget.value
                setForm((current) => ({ ...current, password: value }))
              }}
            />
          </div>
          {modalMode === 'create' ? (
            <p className="admin-inline-note">
              После создания отправим на email ссылку для самостоятельной установки пароля.
            </p>
          ) : null}
          <label className="admin-check-field">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setForm((current) => ({ ...current, isActive: checked }))
              }}
            />
            <span>{form.isActive ? 'Аккаунт активен' : 'Аккаунт отключен'}</span>
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
                  ? 'Создать админа'
                  : 'Сохранить'}
            </button>
          </div>
        </form>
      </AdminModal>

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Удалить админа?"
        message={
          deleteCandidate
            ? `Пользователь «${deleteCandidate.full_name}» будет удален без возможности восстановления.`
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

export default AdminUsersPage
