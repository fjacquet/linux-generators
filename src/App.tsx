import { FallbackError } from '@components/FallbackError'
import { IdentitySection } from '@components/form/IdentitySection'
import { LocaleSection } from '@components/form/LocaleSection'
import { StorageSection } from '@components/form/StorageSection'
import { TargetSection } from '@components/form/TargetSection'
import { LanguageToggle } from '@components/LanguageToggle'
import { PreviewPane } from '@components/PreviewPane'
import { ThemeToggle } from '@components/ThemeToggle'
import { ErrorBoundary } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'

export default function App() {
  const { t } = useTranslation()

  return (
    <ErrorBoundary FallbackComponent={FallbackError}>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-50">
              {t('app.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('app.tagline')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
            <TargetSection />
            <LocaleSection />
            <StorageSection />
            <IdentitySection />
          </form>
          <div className="lg:sticky lg:top-6 lg:h-[calc(100svh-3rem)]">
            <PreviewPane />
          </div>
        </div>
      </div>
      <Toaster richColors position="bottom-right" />
    </ErrorBoundary>
  )
}
