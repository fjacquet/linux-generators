import { type InstallSpec, STORAGE_SCHEMES } from '@engines/model'
import { useSpec } from '@hooks/useSpec'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { SelectField, TextField, ToggleField } from './fields'

export function StorageSection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const { scheme, encryption, swap, wipe } = spec.storage

  const schemeLabel: Record<(typeof STORAGE_SCHEMES)[number], string> = {
    'autopart-lvm': t('option.schemeLvm'),
    'autopart-plain': t('option.schemePlain'),
    direct: t('option.schemeDirect'),
    manual: t('option.schemeManual'),
  }

  return (
    <CollapsibleSection id="storage" title={t('section.storage')}>
      <SelectField
        label={t('field.storageScheme')}
        value={scheme}
        onChange={(v) =>
          update((d) => {
            d.storage.scheme = v as InstallSpec['storage']['scheme']
          })
        }
        options={STORAGE_SCHEMES.map((s) => ({ value: s, label: schemeLabel[s] }))}
      />
      <SelectField
        label={t('field.swap')}
        value={swap}
        onChange={(v) =>
          update((d) => {
            d.storage.swap = v as InstallSpec['storage']['swap']
          })
        }
        options={[
          { value: 'auto', label: t('option.swapAuto') },
          { value: 'none', label: t('option.swapNone') },
          { value: 'size', label: t('option.swapSize') },
        ]}
      />
      <div className="flex items-end">
        <ToggleField
          label={t('field.wipe')}
          checked={wipe}
          onChange={(v) =>
            update((d) => {
              d.storage.wipe = v
            })
          }
        />
      </div>
      <div className="flex items-end">
        <ToggleField
          label={t('field.encryption')}
          checked={encryption.enabled}
          onChange={(v) =>
            update((d) => {
              d.storage.encryption.enabled = v
            })
          }
        />
      </div>
      {encryption.enabled && (
        <TextField
          label={t('field.passphrase')}
          type="password"
          value={encryption.passphrase}
          onChange={(v) =>
            update((d) => {
              d.storage.encryption.passphrase = v
            })
          }
        />
      )}
    </CollapsibleSection>
  )
}
