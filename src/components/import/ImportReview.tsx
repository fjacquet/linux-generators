// src/components/import/ImportReview.tsx
import type { ImportResult } from '@engines/import'
import { useTranslation } from 'react-i18next'

type OkResult = Extract<ImportResult, { ok: true }>

const BADGE: Record<OkResult['report']['fidelity'], string> = {
  exact: 'bg-emerald-500',
  semantic: 'bg-amber-500',
  lossy: 'bg-rose-600',
}

export function ImportReview({
  result,
  onConfirm,
  onCancel,
}: {
  result: OkResult
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { report, diagnostics } = result
  const diffRows = [...report.diff.entries()].map(([i, d]) => (
    <div
      key={`${i}-${d.text}`}
      className={d.tag === 'add' ? 'text-emerald-500' : d.tag === 'del' ? 'text-rose-500' : ''}
    >
      {d.tag === 'add' ? '+ ' : d.tag === 'del' ? '- ' : '  '}
      {d.text}
    </div>
  ))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`rounded px-2 py-0.5 text-white ${BADGE[report.fidelity]}`}>
          {report.fidelity}
        </span>
        <span>
          {t('import.mapped', { count: report.mappedCount })} ·{' '}
          {t('import.preserved', { count: report.passthroughCount })}
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('import.verbatimNote')}</p>
      <pre className="code-pane max-h-72 overflow-auto text-xs">{diffRows}</pre>
      {diagnostics.length > 0 && (
        <ul className="space-y-1 text-sm">
          {diagnostics.map((d) => (
            <li
              key={`${d.severity}:${d.field}:${d.message}`}
              className={d.severity === 'error' ? 'text-diag-error' : 'text-diag-warn'}
            >
              <span aria-hidden>{d.severity === 'error' ? '✕' : '⚠'}</span>{' '}
              <code className="font-mono text-xs opacity-80">{d.field}</code> — {d.message}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-primary" onClick={onConfirm}>
          {t('import.confirm')}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          {t('import.cancel')}
        </button>
      </div>
    </div>
  )
}
