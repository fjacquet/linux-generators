// src/components/import/ImportPanel.tsx
import { type ImportResult, importFile } from '@engines/import'
import { useGeneratorStore } from '@store/generatorStore'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ImportReview } from './ImportReview'

export function ImportPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const loadProfile = useGeneratorStore((s) => s.loadProfile)
  const [text, setText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const onParse = () => setResult(importFile(text))

  const onPickFile = async (file: File) => {
    const content = await file.text()
    setText(content)
    setResult(importFile(content))
  }

  const onConfirm = () => {
    if (result?.ok) {
      loadProfile(result.spec)
      toast.success(t('import.success'))
      onClose()
    }
  }

  return (
    <div className="panel flex flex-col gap-3">
      <textarea
        className="code-pane h-40 w-full"
        aria-label={t('import.paste')}
        placeholder={t('import.placeholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button type="button" className="btn-primary" onClick={onParse}>
          {t('import.parse')}
        </button>
        <label className="btn-ghost cursor-pointer">
          {t('import.chooseFile')}
          <input
            type="file"
            className="hidden"
            accept=".cfg,.ks,.yaml,.yml,user-data,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPickFile(f)
              e.target.value = ''
            }}
          />
        </label>
        <button type="button" className="btn-ghost" onClick={onClose}>
          {t('import.close')}
        </button>
      </div>
      {result && !result.ok && <p className="text-sm text-rose-500">{result.error}</p>}
      {result?.ok && (
        <ImportReview result={result} onConfirm={onConfirm} onCancel={() => setResult(null)} />
      )}
    </div>
  )
}
