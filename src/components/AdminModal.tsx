import { type ReactNode, useEffect } from 'react'
import { lockBodyScroll } from '../lib/body-scroll-lock'
import { CloseIcon } from './icons'

type AdminModalProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

function AdminModal({ open, title, onClose, children, footer }: AdminModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const releaseBodyScrollLock = lockBodyScroll()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      releaseBodyScrollLock()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__head">
          <h3>{title}</h3>
          <button
            className="admin-modal__close"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <CloseIcon size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="admin-modal__body">{children}</div>

        {footer ? <div className="admin-modal__footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export default AdminModal
