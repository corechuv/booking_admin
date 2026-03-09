const DEFAULT_API_URL = 'http://localhost:8001/api/v1'

const rawApiUrl = import.meta.env.VITE_API_URL?.trim()
const API_BASE_URL = (rawApiUrl && rawApiUrl.length > 0 ? rawApiUrl : DEFAULT_API_URL).replace(/\/+$/, '')

export const ADMIN_TOKEN_STORAGE_KEY = 'mira-admin-token'

export const getStoredAdminToken = (): string => {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? ''
}

export const setStoredAdminToken = (token: string): void => {
  if (typeof window === 'undefined') {
    return
  }

  if (!token) {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type ErrorPayload = {
  detail?: unknown
}

const sanitizePermissionMessage = (message: string): string => {
  const normalized = message.toLowerCase()
  if (normalized.includes('super admin') || normalized.includes('super_admin')) {
    return ''
  }
  return message
}

const normalizeError = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') {
    return 'Request failed'
  }

  const { detail } = payload as ErrorPayload

  if (typeof detail === 'string' && detail.trim().length > 0) {
    return sanitizePermissionMessage(detail)
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0]

    if (typeof first === 'string') {
      return sanitizePermissionMessage(first)
    }

    if (first && typeof first === 'object' && 'msg' in first) {
      const msg = (first as { msg?: unknown }).msg
      if (typeof msg === 'string' && msg.trim().length > 0) {
        return sanitizePermissionMessage(msg)
      }
    }
  }

  return 'Request failed'
}

const getErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as unknown
    return normalizeError(payload)
  } catch {
    return response.statusText || 'Request failed'
  }
}

const makeHeaders = (
  initHeaders: HeadersInit | undefined,
  token?: string,
): Headers => {
  const headers = new Headers(initHeaders)

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: makeHeaders(init.headers, token),
  })

  if (!response.ok) {
    const message = await getErrorMessage(response)
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export type LoginPayload = {
  email: string
  password: string
}

export type TokenResponse = {
  access_token: string
  token_type: string
}

export type AuthUserRole = 'client' | 'super_admin' | 'admin' | 'specialist'
export type StaffUserRole = 'super_admin' | 'admin' | 'specialist'

export type AuthUser = {
  id: number
  full_name: string
  email: string
  phone: string | null
  role: AuthUserRole
  is_active: boolean
  created_at: string
}

export const isStaffUserRole = (role: AuthUserRole): role is StaffUserRole =>
  role === 'super_admin' || role === 'admin' || role === 'specialist'

export const isAdminLikeRole = (role: AuthUserRole): boolean =>
  role === 'super_admin' || role === 'admin'

export const isSuperAdminRole = (role: AuthUserRole): boolean =>
  role === 'super_admin'

export type AdminBookingStatus = 'pending' | 'confirmed' | 'completed' | 'canceled'
export type AdminI18nMap = Record<string, string> | null

export type AdminBookingClient = {
  id: number
  full_name: string
  email: string
  phone: string | null
}

export type AdminService = {
  id: number
  category_id: number
  category: string
  owner_specialist_id: number | null
  title: string
  title_i18n: AdminI18nMap
  description: string | null
  description_i18n: AdminI18nMap
  duration_minutes: number
  price: number | string
  old_price: number | string | null
  discount_percent: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AdminBooking = {
  id: number
  client_id: number
  client?: AdminBookingClient | null
  service_id: number
  specialist_name: string | null
  starts_at: string
  ends_at: string
  status: AdminBookingStatus
  consent_accepted: boolean
  comment: string | null
  created_at: string
  updated_at: string
  service: AdminService
}

export type UpdateAdminBookingPayload = {
  status: AdminBookingStatus
  comment?: string | null
}

export type CreateAdminBookingPayload = {
  full_name: string
  email: string
  phone?: string | null
  service_id: number
  specialist_name?: string | null
  starts_at: string
  comment?: string | null
}

export type AdminStats = {
  total_bookings: number
  pending_bookings: number
  confirmed_bookings: number
  active_services: number
}

export type AdminCategory = {
  id: number
  name: string
  name_i18n: AdminI18nMap
  description: string | null
  description_i18n: AdminI18nMap
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateCategoryPayload = {
  name: string
  name_i18n?: AdminI18nMap
  description?: string | null
  description_i18n?: AdminI18nMap
  is_active?: boolean
}

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>

export type AdminFaq = {
  id: number
  question: string
  answer: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateFaqPayload = {
  question: string
  answer: string
  sort_order?: number
  is_active?: boolean
}

export type UpdateFaqPayload = Partial<CreateFaqPayload>

export type AdminContactSettings = {
  id: number
  salon_name: string
  phone: string
  email: string
  address: string
  route_url: string
  created_at: string
  updated_at: string
}

export type UpdateContactPayload = Partial<
  Pick<AdminContactSettings, 'salon_name' | 'phone' | 'email' | 'address' | 'route_url'>
>

export type AdminHourSlot = {
  day_of_week: number
  interval_index: number
  open_time: string | null
  close_time: string | null
  is_closed: boolean
}

export type AdminBusinessHours = {
  scope: string
  specialist_id: number | null
  slots: AdminHourSlot[]
}

export type UpdateBusinessHoursPayload = {
  slots: AdminHourSlot[]
}

export type AdminCertificate = {
  id: number
  title: string
  issuer: string | null
  issued_at: string | null
  image_url: string | null
  document_url: string | null
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateCertificatePayload = {
  title: string
  issuer?: string | null
  issued_at?: string | null
  image_url?: string | null
  document_url?: string | null
  description?: string | null
  sort_order?: number
  is_active?: boolean
}

export type UpdateCertificatePayload = Partial<CreateCertificatePayload>

export type AdminSpecialist = {
  id: number
  full_name: string
  email: string
  phone: string | null
  title: string
  bio: string | null
  photo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AdminUser = {
  id: number
  full_name: string
  email: string
  phone: string | null
  role: 'admin' | 'super_admin'
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateAdminUserPayload = {
  full_name: string
  email: string
  phone?: string | null
  password?: string
  send_invite?: boolean
  is_active?: boolean
  role: 'admin' | 'super_admin'
}

export type UpdateAdminUserPayload = Partial<CreateAdminUserPayload>

export type CreateSpecialistPayload = {
  full_name: string
  email: string
  phone?: string | null
  title: string
  bio?: string | null
  photo_url?: string | null
  is_active?: boolean
  password?: string
  send_invite?: boolean
}

export type UpdateSpecialistPayload = Partial<CreateSpecialistPayload>

export type SpecialistSelfProfilePayload = {
  full_name?: string
  email?: string
  phone?: string | null
  title?: string
  bio?: string | null
  photo_url?: string | null
}

export type SpecialistSelfPasswordPayload = {
  current_password: string
  new_password: string
}

export type SpecialistSharedServicesPayload = {
  service_ids: number[]
}

export type SpecialistSharedServicesOut = {
  specialist_id: number
  service_ids: number[]
}

export type SpecialistServicesOut = {
  specialist_id: number
  shared_service_ids: number[]
  custom_services: AdminService[]
}

export type CreateSpecialistCustomServicePayload = {
  category_id: number
  title: string
  title_i18n?: AdminI18nMap
  description?: string | null
  description_i18n?: AdminI18nMap
  duration_minutes: number
  price: number
  old_price?: number | null
  is_active?: boolean
}

export type PasswordSetupCompletePayload = {
  token: string
  password: string
}

export const fetchCurrentUser = (token: string) =>
  request<AuthUser>('/client/me', {}, token)

export type CreateServicePayload = {
  category_id: number
  owner_specialist_id?: number | null
  title: string
  title_i18n?: AdminI18nMap
  description?: string | null
  description_i18n?: AdminI18nMap
  duration_minutes: number
  price: number
  old_price?: number | null
  is_active?: boolean
}

export type UpdateServicePayload = Partial<CreateServicePayload>

export type AdminLanguage = {
  id: number
  code: string
  name: string
  sort_order: number
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

export type CreateAdminLanguagePayload = {
  code: string
  name: string
  sort_order?: number
  is_active?: boolean
  is_default?: boolean
}

export type UpdateAdminLanguagePayload = Partial<CreateAdminLanguagePayload>

export const login = (payload: LoginPayload) =>
  request<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const completePasswordSetup = (payload: PasswordSetupCompletePayload) =>
  request<{ message: string }>(
    '/auth/password-setup/complete',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )

export const fetchAdminStats = (token: string) =>
  request<AdminStats>('/admin/stats', {}, token)

export const fetchAdminBookings = (token: string) =>
  request<AdminBooking[]>('/admin/bookings', {}, token)

export const updateAdminBooking = (
  token: string,
  bookingId: number,
  payload: UpdateAdminBookingPayload,
) =>
  request<AdminBooking>(
    `/admin/bookings/${bookingId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const createAdminBooking = (
  token: string,
  payload: CreateAdminBookingPayload,
) =>
  request<AdminBooking>(
    '/admin/bookings',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const fetchAdminServices = (token: string) =>
  request<AdminService[]>('/admin/services', {}, token)

export const fetchAdminCategories = (token: string) =>
  request<AdminCategory[]>('/admin/categories', {}, token)

export const fetchAdminLanguages = (token: string) =>
  request<AdminLanguage[]>('/admin/languages', {}, token)

export const createAdminLanguage = (token: string, payload: CreateAdminLanguagePayload) =>
  request<AdminLanguage>(
    '/admin/languages',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminLanguage = (
  token: string,
  languageId: number,
  payload: UpdateAdminLanguagePayload,
) =>
  request<AdminLanguage>(
    `/admin/languages/${languageId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const deleteAdminLanguage = (token: string, languageId: number) =>
  request<void>(
    `/admin/languages/${languageId}`,
    {
      method: 'DELETE',
    },
    token,
  )

export const createAdminCategory = (token: string, payload: CreateCategoryPayload) =>
  request<AdminCategory>(
    '/admin/categories',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminCategory = (
  token: string,
  categoryId: number,
  payload: UpdateCategoryPayload,
) =>
  request<AdminCategory>(
    `/admin/categories/${categoryId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const deleteAdminCategory = (token: string, categoryId: number) =>
  request<void>(
    `/admin/categories/${categoryId}`,
    {
      method: 'DELETE',
    },
    token,
  )

export const fetchAdminFaqs = (token: string) =>
  request<AdminFaq[]>('/admin/faqs', {}, token)

export const createAdminFaq = (token: string, payload: CreateFaqPayload) =>
  request<AdminFaq>(
    '/admin/faqs',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminFaq = (token: string, faqId: number, payload: UpdateFaqPayload) =>
  request<AdminFaq>(
    `/admin/faqs/${faqId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const deleteAdminFaq = (token: string, faqId: number) =>
  request<void>(
    `/admin/faqs/${faqId}`,
    {
      method: 'DELETE',
    },
    token,
  )

export const fetchAdminContact = (token: string) =>
  request<AdminContactSettings>('/admin/contact', {}, token)

export const updateAdminContact = (token: string, payload: UpdateContactPayload) =>
  request<AdminContactSettings>(
    '/admin/contact',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  )

export const fetchAdminGeneralHours = (token: string) =>
  request<AdminBusinessHours>('/admin/hours/general', {}, token)

export const updateAdminGeneralHours = (token: string, payload: UpdateBusinessHoursPayload) =>
  request<AdminBusinessHours>(
    '/admin/hours/general',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  )

export const fetchAdminSpecialistHours = (token: string, specialistId: number) =>
  request<AdminBusinessHours>(`/admin/hours/specialists/${specialistId}`, {}, token)

export const updateAdminSpecialistHours = (
  token: string,
  specialistId: number,
  payload: UpdateBusinessHoursPayload,
) =>
  request<AdminBusinessHours>(
    `/admin/hours/specialists/${specialistId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  )

export const fetchAdminCertificates = (token: string) =>
  request<AdminCertificate[]>('/admin/certificates', {}, token)

export const createAdminCertificate = (token: string, payload: CreateCertificatePayload) =>
  request<AdminCertificate>(
    '/admin/certificates',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminCertificate = (
  token: string,
  certificateId: number,
  payload: UpdateCertificatePayload,
) =>
  request<AdminCertificate>(
    `/admin/certificates/${certificateId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const deleteAdminCertificate = (token: string, certificateId: number) =>
  request<void>(
    `/admin/certificates/${certificateId}`,
    {
      method: 'DELETE',
    },
    token,
  )

export const fetchAdminSpecialists = (token: string) =>
  request<AdminSpecialist[]>('/admin/specialists', {}, token)

export const fetchAdminSpecialistMe = (token: string) =>
  request<AdminSpecialist>('/admin/specialists/me', {}, token)

export const updateAdminSpecialistMeProfile = (
  token: string,
  payload: SpecialistSelfProfilePayload,
) =>
  request<AdminSpecialist>(
    '/admin/specialists/me/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminSpecialistMePassword = (
  token: string,
  payload: SpecialistSelfPasswordPayload,
) =>
  request<void>(
    '/admin/specialists/me/password',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const createAdminSpecialist = (token: string, payload: CreateSpecialistPayload) =>
  request<AdminSpecialist>(
    '/admin/specialists',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminSpecialist = (
  token: string,
  specialistId: number,
  payload: UpdateSpecialistPayload,
) =>
  request<AdminSpecialist>(
    `/admin/specialists/${specialistId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const deleteAdminSpecialist = (token: string, specialistId: number) =>
  request<void>(
    `/admin/specialists/${specialistId}`,
    {
      method: 'DELETE',
    },
    token,
  )

export const fetchAdminSpecialistServices = (token: string, specialistId: number) =>
  request<SpecialistServicesOut>(`/admin/specialists/${specialistId}/services`, {}, token)

export const updateAdminSpecialistSharedServices = (
  token: string,
  specialistId: number,
  payload: SpecialistSharedServicesPayload,
) =>
  request<SpecialistSharedServicesOut>(
    `/admin/specialists/${specialistId}/services/shared`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  )

export const createAdminSpecialistCustomService = (
  token: string,
  specialistId: number,
  payload: CreateSpecialistCustomServicePayload,
) =>
  request<AdminService>(
    `/admin/specialists/${specialistId}/services/custom`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminSpecialistCustomService = (
  token: string,
  specialistId: number,
  serviceId: number,
  payload: CreateSpecialistCustomServicePayload,
) =>
  request<AdminService>(
    `/admin/specialists/${specialistId}/services/custom/${serviceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const deleteAdminSpecialistCustomService = (
  token: string,
  specialistId: number,
  serviceId: number,
) =>
  request<void>(
    `/admin/specialists/${specialistId}/services/custom/${serviceId}`,
    {
      method: 'DELETE',
    },
    token,
  )

export const fetchAdminUsers = (token: string) =>
  request<AdminUser[]>('/admin/admin-users', {}, token)

export const createAdminUser = (token: string, payload: CreateAdminUserPayload) =>
  request<AdminUser>(
    '/admin/admin-users',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminUser = (
  token: string,
  userId: number,
  payload: UpdateAdminUserPayload,
) =>
  request<AdminUser>(
    `/admin/admin-users/${userId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const deleteAdminUser = (token: string, userId: number) =>
  request<void>(
    `/admin/admin-users/${userId}`,
    {
      method: 'DELETE',
    },
    token,
  )

export const createAdminService = (token: string, payload: CreateServicePayload) =>
  request<AdminService>(
    '/admin/services',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )

export const updateAdminService = (
  token: string,
  serviceId: number,
  payload: UpdateServicePayload,
) =>
  request<AdminService>(
    `/admin/services/${serviceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )

export const deleteAdminService = (token: string, serviceId: number) =>
  request<void>(
    `/admin/services/${serviceId}`,
    {
      method: 'DELETE',
    },
    token,
  )
