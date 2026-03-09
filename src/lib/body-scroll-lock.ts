const LOCK_COUNT_KEY = 'adminScrollLockCount'
const PREV_OVERFLOW_KEY = 'adminPrevOverflow'
const PREV_PADDING_RIGHT_KEY = 'adminPrevPaddingRight'

const getLockCount = (body: HTMLElement): number => {
  const raw = body.dataset[LOCK_COUNT_KEY]
  const parsed = Number.parseInt(raw ?? '0', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export const lockBodyScroll = (): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined
  }

  const body = document.body
  const html = document.documentElement
  const currentCount = getLockCount(body)

  if (currentCount === 0) {
    body.dataset[PREV_OVERFLOW_KEY] = body.style.overflow
    body.dataset[PREV_PADDING_RIGHT_KEY] = body.style.paddingRight

    const scrollbarWidth = window.innerWidth - html.clientWidth
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }
    body.style.overflow = 'hidden'
  }

  body.dataset[LOCK_COUNT_KEY] = String(currentCount + 1)

  let released = false

  return () => {
    if (released) {
      return
    }
    released = true

    const nextCount = Math.max(getLockCount(body) - 1, 0)
    if (nextCount > 0) {
      body.dataset[LOCK_COUNT_KEY] = String(nextCount)
      return
    }

    const previousOverflow = body.dataset[PREV_OVERFLOW_KEY] ?? ''
    const previousPaddingRight = body.dataset[PREV_PADDING_RIGHT_KEY] ?? ''

    body.style.overflow = previousOverflow
    body.style.paddingRight = previousPaddingRight

    delete body.dataset[LOCK_COUNT_KEY]
    delete body.dataset[PREV_OVERFLOW_KEY]
    delete body.dataset[PREV_PADDING_RIGHT_KEY]
  }
}
