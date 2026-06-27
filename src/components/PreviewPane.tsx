import { useGeneratedConfig } from '@hooks/useGeneratedConfig'
import { useTranslation } from 'react-i18next'
import { DownloadButton } from './DownloadButton'

export function PreviewPane() {
  const { t } = useTranslation()
  const { files } = useGeneratedConfig()
  const file = files[0]

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('preview.title')}: <code className="font-mono text-primary-600">{file?.filename}</code>
        </h2>
        {file && <DownloadButton filename={file.filename} content={file.content} />}
      </div>
      <pre className="code-pane min-h-0 flex-1">{file?.content ?? ''}</pre>
    </div>
  )
}
