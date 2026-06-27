import { useGeneratedConfig } from '@hooks/useGeneratedConfig'
import { useTranslation } from 'react-i18next'

export function DiagnosticsList() {
  const { t } = useTranslation()
  const { diagnostics } = useGeneratedConfig()

  if (diagnostics.length === 0) {
    return (
      <div className="panel py-2 text-sm text-primary-600 dark:text-primary-300">
        ✓ {t('diagnostics.none')}
      </div>
    )
  }

  return (
    <div className="panel max-h-40 space-y-1 overflow-auto py-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t('diagnostics.title')} ({diagnostics.length})
      </h2>
      <ul className="space-y-1 text-sm">
        {diagnostics.map((diag) => (
          <li
            key={`${diag.severity}:${diag.field}:${diag.message}`}
            className={diag.severity === 'error' ? 'text-diag-error' : 'text-diag-warn'}
          >
            <span aria-hidden>{diag.severity === 'error' ? '✕' : '⚠'}</span>{' '}
            <code className="font-mono text-xs opacity-80">{diag.field}</code> — {diag.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
