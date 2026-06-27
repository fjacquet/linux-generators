import { downloadText } from '@utils/download'
import { useTranslation } from 'react-i18next'

export function DownloadButton({ filename, content }: { filename: string; content: string }) {
  const { t } = useTranslation()
  return (
    <button type="button" className="btn-primary" onClick={() => downloadText(filename, content)}>
      {t('preview.download')} {filename}
    </button>
  )
}
