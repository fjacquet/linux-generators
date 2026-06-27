import { useSpec } from '@hooks/useSpec'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { SelectField, TextField } from './fields'

export function NetworkSection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const iface = spec.network.interfaces[0]
  const mode = iface?.mode ?? 'dhcp'

  // The model always has at least one interface; edits target interfaces[0].
  const editIface = (mutate: (i: NonNullable<typeof iface>) => void) =>
    update((d) => {
      const first = d.network.interfaces[0]
      if (first) mutate(first)
    })

  return (
    <CollapsibleSection id="network" title={t('section.network')}>
      <TextField
        label={t('field.hostname')}
        value={spec.network.hostname}
        onChange={(v) =>
          update((d) => {
            d.network.hostname = v
          })
        }
      />
      <TextField
        label={t('field.device')}
        value={iface?.device ?? 'link'}
        onChange={(v) =>
          editIface((i) => {
            i.device = v
          })
        }
      />
      <SelectField
        label={t('field.netmode')}
        value={mode}
        onChange={(v) =>
          editIface((i) => {
            i.mode = v as 'dhcp' | 'static'
          })
        }
        options={[
          { value: 'dhcp', label: 'DHCP' },
          { value: 'static', label: 'Static' },
        ]}
      />
      {mode === 'static' && (
        <>
          <TextField
            label={t('field.ip')}
            value={iface?.ip ?? ''}
            onChange={(v) =>
              editIface((i) => {
                i.ip = v
              })
            }
          />
          <TextField
            label={t('field.prefix')}
            type="number"
            value={String(iface?.prefix ?? 24)}
            onChange={(v) =>
              editIface((i) => {
                i.prefix = Number(v) || 0
              })
            }
          />
          <TextField
            label={t('field.gateway')}
            value={iface?.gateway ?? ''}
            onChange={(v) =>
              editIface((i) => {
                i.gateway = v
              })
            }
          />
          <TextField
            label={t('field.nameservers')}
            value={(iface?.nameservers ?? []).join(', ')}
            onChange={(v) =>
              editIface((i) => {
                i.nameservers = v
                  .split(/[\s,]+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
          />
        </>
      )}
    </CollapsibleSection>
  )
}
