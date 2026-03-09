const TABLE_SELECTOR =
  '.admin-table:not(.admin-week-table):not(.admin-week-mobile-table)'

const normalizeText = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const syncTableLabels = (root: ParentNode): void => {
  const tables = root.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR)

  tables.forEach((table) => {
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th')).map(
      (header, index) => {
        const explicitLabel = normalizeText(header.getAttribute('data-mobile-label'))
        if (explicitLabel) {
          return explicitLabel
        }
        const textLabel = normalizeText(header.textContent)
        if (textLabel) {
          return textLabel
        }
        return `Колонка ${index + 1}`
      },
    )

    const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr')
    rows.forEach((row) => {
      const cells = Array.from(row.children).filter(
        (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement,
      )

      let dataCellIndex = 0
      cells.forEach((cell) => {
        if (cell.tagName !== 'TD') {
          return
        }

        const existing = normalizeText(cell.getAttribute('data-label'))
        if (existing) {
          dataCellIndex += 1
          return
        }

        const label = headers[dataCellIndex] ?? 'Значение'
        cell.setAttribute('data-label', label)
        dataCellIndex += 1
      })
    })
  })
}

export const enableResponsiveTableLabels = (): (() => void) => {
  if (typeof document === 'undefined') {
    return () => undefined
  }

  syncTableLabels(document)

  const observer = new MutationObserver(() => {
    syncTableLabels(document)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  return () => observer.disconnect()
}
