import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  fetchAdminSpecialistMe,
  getStoredAdminToken,
  updateAdminSpecialistMePassword,
  updateAdminSpecialistMeProfile,
  type AdminSpecialist,
} from '../api/backend-api'

type ProfileFormState = {
  fullName: string
  email: string
  phone: string
  title: string
  bio: string
  photoUrl: string
}

type PasswordFormState = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const emptyProfileForm: ProfileFormState = {
  fullName: '',
  email: '',
  phone: '',
  title: '',
  bio: '',
  photoUrl: '',
}

const emptyPasswordForm: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Ошибка при обновлении профиля.'
}

const specialistToForm = (specialist: AdminSpecialist): ProfileFormState => ({
  fullName: specialist.full_name,
  email: specialist.email,
  phone: specialist.phone ?? '',
  title: specialist.title,
  bio: specialist.bio ?? '',
  photoUrl: specialist.photo_url ?? '',
})

function SpecialistProfilePage() {
  const [profile, setProfile] = useState<AdminSpecialist | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm)
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadSpecialistProfile = useCallback(async () => {
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const specialist = await fetchAdminSpecialistMe(token)
      setProfile(specialist)
      setProfileForm(specialistToForm(specialist))
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSpecialistProfile()
  }, [loadSpecialistProfile])

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    setIsSavingProfile(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await updateAdminSpecialistMeProfile(token, {
        full_name: profileForm.fullName.trim(),
        email: profileForm.email.trim().toLowerCase(),
        phone: profileForm.phone.trim() || null,
        title: profileForm.title.trim(),
        bio: profileForm.bio.trim() || null,
        photo_url: profileForm.photoUrl.trim() || null,
      })
      setProfile(updated)
      setProfileForm(specialistToForm(updated))
      setSuccess('Профиль обновлен.')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleSavePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = getStoredAdminToken()
    if (!token) {
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setError('Новый пароль должен быть не короче 8 символов.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Подтверждение пароля не совпадает.')
      return
    }

    setIsSavingPassword(true)
    setError(null)
    setSuccess(null)
    try {
      await updateAdminSpecialistMePassword(token, {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      })
      setPasswordForm(emptyPasswordForm)
      setSuccess('Пароль обновлен.')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <section className="admin-block">
      <div className="admin-block__head">
        <h1>Мой профиль</h1>
        <p>Данные специалиста, которые отображаются в клиентском интерфейсе.</p>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}
      {success ? <p className="admin-inline-note">{success}</p> : null}

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Профиль специалиста</h2>
          <span>{profile?.full_name ?? 'Загрузка...'}</span>
        </div>

        <form className="admin-service-form" onSubmit={(event) => void handleSaveProfile(event)}>
          <label className="admin-form-field">
            <span>Имя и фамилия</span>
            <input
              type="text"
              value={profileForm.fullName}
              onChange={(event) => {
                const value = event.currentTarget.value
                setProfileForm((current) => ({ ...current, fullName: value }))
              }}
              required
              disabled={isLoading || isSavingProfile}
            />
          </label>
          <label className="admin-form-field">
            <span>Email</span>
            <input
              type="email"
              value={profileForm.email}
              onChange={(event) => {
                const value = event.currentTarget.value
                setProfileForm((current) => ({ ...current, email: value }))
              }}
              required
              disabled={isLoading || isSavingProfile}
            />
          </label>
          <label className="admin-form-field">
            <span>Телефон</span>
            <input
              type="text"
              value={profileForm.phone}
              onChange={(event) => {
                const value = event.currentTarget.value
                setProfileForm((current) => ({ ...current, phone: value }))
              }}
              disabled={isLoading || isSavingProfile}
            />
          </label>
          <label className="admin-form-field">
            <span>Должность</span>
            <input
              type="text"
              value={profileForm.title}
              onChange={(event) => {
                const value = event.currentTarget.value
                setProfileForm((current) => ({ ...current, title: value }))
              }}
              required
              disabled={isLoading || isSavingProfile}
            />
          </label>
          <label className="admin-form-field">
            <span>Описание</span>
            <textarea
              rows={3}
              value={profileForm.bio}
              onChange={(event) => {
                const value = event.currentTarget.value
                setProfileForm((current) => ({ ...current, bio: value }))
              }}
              disabled={isLoading || isSavingProfile}
            />
          </label>
          <label className="admin-form-field">
            <span>Ссылка на фото</span>
            <input
              type="text"
              value={profileForm.photoUrl}
              onChange={(event) => {
                const value = event.currentTarget.value
                setProfileForm((current) => ({ ...current, photoUrl: value }))
              }}
              disabled={isLoading || isSavingProfile}
            />
          </label>

          <button
            className="admin-inline-btn admin-inline-btn--accent"
            type="submit"
            disabled={isLoading || isSavingProfile}
          >
            {isSavingProfile ? 'Сохраняем...' : 'Сохранить профиль'}
          </button>
        </form>
      </article>

      <article className="admin-card">
        <div className="admin-card__head">
          <h2>Смена пароля</h2>
          <span>Доступ к кабинету</span>
        </div>

        <form className="admin-service-form" onSubmit={(event) => void handleSavePassword(event)}>
          <label className="admin-form-field">
            <span>Текущий пароль</span>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => {
                const value = event.currentTarget.value
                setPasswordForm((current) => ({ ...current, currentPassword: value }))
              }}
              required
              disabled={isSavingPassword}
            />
          </label>
          <label className="admin-form-field">
            <span>Новый пароль</span>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => {
                const value = event.currentTarget.value
                setPasswordForm((current) => ({ ...current, newPassword: value }))
              }}
              required
              minLength={8}
              disabled={isSavingPassword}
            />
          </label>
          <label className="admin-form-field">
            <span>Повтор нового пароля</span>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => {
                const value = event.currentTarget.value
                setPasswordForm((current) => ({ ...current, confirmPassword: value }))
              }}
              required
              minLength={8}
              disabled={isSavingPassword}
            />
          </label>

          <button
            className="admin-inline-btn admin-inline-btn--accent"
            type="submit"
            disabled={isSavingPassword}
          >
            {isSavingPassword ? 'Обновляем...' : 'Обновить пароль'}
          </button>
        </form>
      </article>
    </section>
  )
}

export default SpecialistProfilePage
