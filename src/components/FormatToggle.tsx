import type { TargetFormat } from '@engines/model'
import { selectTargetFormat, useGeneratorStore } from '@store/generatorStore'
import { useTranslation } from 'react-i18next'

const OPTIONS: { value: TargetFormat; labelKey: string }[] = [
  { value: 'kickstart', labelKey: 'format.kickstart' },
  { value: 'autoinstall', labelKey: 'format.autoinstall' },
  { value: 'preseed', labelKey: 'format.preseed' },
]

export function FormatToggle() {
  const { t } = useTranslation()
  const format = useGeneratorStore(selectTargetFormat)
  const chooseFormat = useGeneratorStore((s) => s.chooseFormat)

  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-surface-700">
      {OPTIONS.map((opt) => {
        const active = format === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => chooseFormat(opt.value)}
            className={
              active
                ? 'bg-primary-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'bg-transparent px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-800'
            }
          >
            {t(opt.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
