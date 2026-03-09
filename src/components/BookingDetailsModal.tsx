import { useEffect, useState } from 'react'
import type {
  AdminBooking,
  AdminBookingStatus,
  UpdateAdminBookingPayload,
} from '../api/backend-api'
import {
  bookingStatusLabel,
  formatBookingDateTime,
  formatBookingTime,
  formatPrice,
} from '../lib/admin-format'
import AdminModal from './AdminModal'

const statusOptions: AdminBookingStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'canceled',
]

type BookingDetailsModalProps = {
  booking: AdminBooking | null
  isSaving?: boolean
  onSave?: (bookingId: number, payload: UpdateAdminBookingPayload) => void | Promise<void>
  onClose: () => void
}

const getClientName = (booking: AdminBooking): string => {
  const value = booking.client?.full_name?.trim()
  return value && value.length > 0 ? value : `Client #${booking.client_id}`
}

const getClientContacts = (booking: AdminBooking): string => {
  const contacts = [booking.client?.email, booking.client?.phone]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value.length > 0))
  return contacts.length ? contacts.join(' · ') : '—'
}

function BookingDetailsModal({
  booking,
  isSaving = false,
  onSave,
  onClose,
}: BookingDetailsModalProps) {
  const [statusDraft, setStatusDraft] = useState<AdminBookingStatus>('pending')
  const [commentDraft, setCommentDraft] = useState('')

  useEffect(() => {
    if (!booking) {
      return
    }
    setStatusDraft(booking.status)
    setCommentDraft(booking.comment ?? '')
  }, [booking])

  if (!booking) {
    return null
  }

  const normalizedCurrentComment = (booking.comment ?? '').trim()
  const normalizedDraftComment = commentDraft.trim()
  const hasChanges = statusDraft !== booking.status || normalizedDraftComment !== normalizedCurrentComment

  const canEdit = typeof onSave === 'function'
  const handleSave = async () => {
    if (!onSave || !hasChanges) {
      return
    }
    await onSave(booking.id, {
      status: statusDraft,
      comment: normalizedDraftComment.length ? normalizedDraftComment : null,
    })
  }

  return (
    <AdminModal
      open={Boolean(booking)}
      title={`Запись #BK-${booking.id}`}
      footer={canEdit ? (
        <>
          <button className="admin-inline-btn" type="button" onClick={onClose} disabled={isSaving}>
            Закрыть
          </button>
          <button
            className="admin-inline-btn admin-inline-btn--accent"
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </>
      ) : undefined}
      onClose={onClose}
    >
      <ul className="admin-content-list booking-details-list">
        <li>
          <strong>Клиент</strong>
          <b>{getClientName(booking)}</b>
        </li>
        <li>
          <strong>Контакты</strong>
          <b>{getClientContacts(booking)}</b>
        </li>
        <li>
          <strong>Процедура</strong>
          <b>{booking.service.title}</b>
        </li>
        <li>
          <strong>Категория</strong>
          <b>{booking.service.category}</b>
        </li>
        <li>
          <strong>Стоимость</strong>
          <b>{formatPrice(booking.service.price)}</b>
        </li>
        <li>
          <strong>Слот</strong>
          <b>
            {formatBookingDateTime(booking.starts_at)} — {formatBookingTime(booking.ends_at)}
          </b>
        </li>
        <li>
          <strong>Специалист</strong>
          <b>{booking.specialist_name ?? 'Любой'}</b>
        </li>
        <li>
          <strong>Статус</strong>
          {canEdit ? (
            <select
              className="admin-status-select"
              value={statusDraft}
              onChange={(event) => {
                setStatusDraft(event.currentTarget.value as AdminBookingStatus)
              }}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {bookingStatusLabel[status]}
                </option>
              ))}
            </select>
          ) : (
            <b>{bookingStatusLabel[booking.status]}</b>
          )}
        </li>
        <li>
          <strong>Согласие</strong>
          <b>{booking.consent_accepted ? 'Да' : 'Нет'}</b>
        </li>
        <li>
          <strong>Комментарий</strong>
          {canEdit ? (
            <textarea
              className="admin-inline-textarea"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.currentTarget.value)}
              rows={3}
              placeholder="Комментарий к записи"
            />
          ) : (
            <b>{booking.comment?.trim() || '—'}</b>
          )}
        </li>
      </ul>
    </AdminModal>
  )
}

export default BookingDetailsModal
