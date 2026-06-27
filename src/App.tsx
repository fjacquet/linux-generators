import { DiagnosticsList } from '@components/DiagnosticsList'
import { FallbackError } from '@components/FallbackError'
import { FormatToggle } from '@components/FormatToggle'
import { IdentitySection } from '@components/form/IdentitySection'
import { LocaleSection } from '@components/form/LocaleSection'
import { NetworkSection } from '@components/form/NetworkSection'
import { PackagesSection } from '@components/form/PackagesSection'
import { ScriptsSection } from '@components/form/ScriptsSection'
import { SecuritySection } from '@components/form/SecuritySection'
import { StorageSection } from '@components/form/StorageSection'
import { TargetSection } from '@components/form/TargetSection'
import { LanguageToggle } from '@components/LanguageToggle'
import { PreviewPane } from '@components/PreviewPane'
import { ProfileBar } from '@components/ProfileBar'
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

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-surface-700 dark:bg-surface-800">
          <FormatToggle />
          <ProfileBar />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
            <TargetSection />
            <LocaleSection />
            <StorageSection />
            <NetworkSection />
            <IdentitySection />
            <PackagesSection />
            <SecuritySection />
            <ScriptsSection />
          </form>
          <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:h-[calc(100svh-3rem)]">
            <DiagnosticsList />
            <div className="min-h-0 flex-1">
              <PreviewPane />
            </div>
          </div>
        </div>
      </div>
      <Toaster richColors position="bottom-right" />
    </ErrorBoundary>
  )
}
