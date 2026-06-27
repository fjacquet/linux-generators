import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Type a plaintext password (hashed to $6$ client-side by the parent) or paste
 *  an existing $6$ hash. The plaintext never leaves component state. */
export function PasswordField({
  label,
  hasHash,
  onSet,
  onClear,
}: {
  label: string
  hasHash: boolean
  onSet: (plainOrHash: string) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState('')

  const apply = () => {
    if (!text) return
    onSet(text)
    setText('')
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={id}
          className="field-input"
          type="password"
          value={text}
          placeholder={t('password.hint')}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="btn-ghost shrink-0" onClick={apply} disabled={!text}>
          {t('password.set')}
        </button>
        {hasHash && (
          <button type="button" className="btn-ghost shrink-0" onClick={onClear}>
            {t('password.clear')}
          </button>
        )}
      </div>
      {hasHash && <p className="mt-1 text-xs text-primary-600">✓ {t('password.isSet')}</p>}
    </div>
  )
}
