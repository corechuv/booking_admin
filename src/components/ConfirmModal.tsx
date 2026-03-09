import AdminModal from './AdminModal'

type ConfirmModalProps = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirmTone?: 'danger' | 'primary'
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  confirmTone = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <AdminModal
      open={open}
      title={title}
      onClose={onCancel}
      footer={(
        <>
          <button className="admin-inline-btn" type="button" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </button>
          <button
            className={
              confirmTone === 'danger'
                ? 'admin-inline-btn is-danger'
                : 'admin-inline-btn admin-inline-btn--accent'
            }
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Выполняем...' : confirmLabel}
          </button>
        </>
      )}
    >
      <p className="admin-inline-note">{message}</p>
    </AdminModal>
  )
}

export default ConfirmModal
