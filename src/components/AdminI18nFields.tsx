import type { AdminI18nMap, AdminLanguage } from '../api/backend-api'

type AdminI18nFieldsProps = {
  title: string
  languages: AdminLanguage[]
  value: AdminI18nMap
  onChange: (next: AdminI18nMap) => void
  multiline?: boolean
  rows?: number
}

const normalizeMap = (value: Record<string, string>): AdminI18nMap => {
  const next: Record<string, string> = {}
  Object.entries(value).forEach(([key, raw]) => {
    const normalizedKey = key.trim().toLowerCase()
    const normalizedValue = raw.trim()
    if (!normalizedKey || !normalizedValue) {
      return
    }
    next[normalizedKey] = normalizedValue
  })

  return Object.keys(next).length ? next : null
}

const toEditableMap = (value: AdminI18nMap): Record<string, string> => ({ ...(value ?? {}) })

function AdminI18nFields({
  title,
  languages,
  value,
  onChange,
  multiline = false,
  rows = 2,
}: AdminI18nFieldsProps) {
  const sortedLanguages = [...languages].sort(
    (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code),
  )
  const draft = toEditableMap(value)

  const handleValueChange = (code: string, nextValue: string) => {
    const nextDraft = { ...draft, [code]: nextValue }
    onChange(normalizeMap(nextDraft))
  }

  return (
    <fieldset className="admin-i18n-fields">
      <legend>{title}</legend>
      <div className="admin-i18n-grid">
        {sortedLanguages.map((language) => {
          const fieldLabel = `${language.name} (${language.code})`
          const fieldValue = draft[language.code] ?? ''

          return (
            <label className="admin-i18n-field" key={`${title}:${language.code}`}>
              <span>{fieldLabel}</span>
              {multiline ? (
                <textarea
                  rows={rows}
                  value={fieldValue}
                  onChange={(event) =>
                    handleValueChange(language.code, event.currentTarget.value)
                  }
                />
              ) : (
                <input
                  type="text"
                  value={fieldValue}
                  onChange={(event) =>
                    handleValueChange(language.code, event.currentTarget.value)
                  }
                />
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export default AdminI18nFields
