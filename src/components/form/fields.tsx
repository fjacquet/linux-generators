import { useId } from 'react'

// Small, presentational, reusable controls. They hold no store knowledge —
// sections pass value + onChange. Keeps every section terse and consistent.

interface BaseProps {
  label: string
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: BaseProps & {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  const id = useId()
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field-input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export interface SelectOption {
  value: string
  label: string
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: BaseProps & {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="field-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function ToggleField({
  label,
  checked,
  onChange,
}: BaseProps & { checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId()
  return (
    <label
      className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
      htmlFor={id}
    >
      <input
        id={id}
        type="checkbox"
        className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: BaseProps & {
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
}) {
  const id = useId()
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="field-input font-mono"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
