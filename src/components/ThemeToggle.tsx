import { useTheme } from '@hooks/useTheme'
import { useTranslation } from 'react-i18next'

export function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, toggle } = useTheme()
  return (
    <button type="button" className="btn-ghost" aria-label={t('theme.toggle')} onClick={toggle}>
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
