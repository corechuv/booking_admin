import type { AdminBookingStatus } from '../api/backend-api'

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
})

const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
})

export const formatBookingDateTime = (value: string): string =>
  dateTimeFormatter.format(new Date(value))

export const formatBookingDateShort = (value: string): string =>
  dateFormatter.format(new Date(value))

export const formatBookingTime = (value: string): string =>
  timeFormatter.format(new Date(value))

export const formatPrice = (value: number | string): string => {
  const amount = typeof value === 'number' ? value : Number.parseFloat(value)

  if (!Number.isFinite(amount)) {
    return '€0'
  }

  return Number.isInteger(amount)
    ? `€${amount.toFixed(0)}`
    : `€${amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`
}

export const bookingStatusLabel: Record<AdminBookingStatus, string> = {
  pending: 'В ожидании',
  confirmed: 'Подтверждено',
  completed: 'Завершено',
  canceled: 'Отменено',
}
