import { useSpec } from '@hooks/useSpec'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { TextField } from './fields'

export function LocaleSection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const { language, keyboard, timezone } = spec.locale

  return (
    <CollapsibleSection id="locale" title={t('section.locale')}>
      <TextField
        label={t('field.language')}
        value={language}
        placeholder="en_US.UTF-8"
        onChange={(v) =>
          update((d) => {
            d.locale.language = v
          })
        }
      />
      <TextField
        label={t('field.keyboard')}
        value={keyboard}
        placeholder="us"
        onChange={(v) =>
          update((d) => {
            d.locale.keyboard = v
          })
        }
      />
      <TextField
        label={t('field.timezone')}
        value={timezone}
        placeholder="UTC"
        onChange={(v) =>
          update((d) => {
            d.locale.timezone = v
          })
        }
      />
    </CollapsibleSection>
  )
}
