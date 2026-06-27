import { selectTargetFormat, useGeneratorStore } from '@store/generatorStore'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Marks a field group whose value the active target cannot emit: a subtle left
 * border + tint on the WRAPPER, plus a muted note. The input itself is never
 * dimmed — it keeps full WCAG contrast and stays editable, so the value survives
 * a target swap and the field is still usable.
 */
export function CrossFormatGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border-l-2 border-diag-warn/60 bg-diag-warn/10 py-2 pl-3 sm:col-span-2">
      {children}
      <CrossFormatNote />
    </div>
  )
}

/**
 * The muted "Not emitted for {{format}}" line. `{{format}}` is the human-readable
 * format name (e.g. "Autoinstall (Ubuntu)"), never the raw engine id.
 */
export function CrossFormatNote() {
  const { t } = useTranslation()
  const format = useGeneratorStore(selectTargetFormat)
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      ⓘ {t('field.notEmitted', { format: t(`format.${format}`) })}
    </p>
  )
}
