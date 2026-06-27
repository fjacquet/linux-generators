import type { InstallSpec } from '@engines/model'
import { useCrossFormatDrops } from '@hooks/useCrossFormatDrops'
import { useSpec } from '@hooks/useSpec'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { CrossFormatGroup } from './CrossFormatNote'
import { SelectField, TextField, ToggleField } from './fields'

export function SecuritySection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const drops = useCrossFormatDrops()
  const isUbuntu = spec.target.osFamily === 'ubuntu'
  const { selinux, apparmor, firewall, sshHardening } = spec.security

  // Firewall is shown on both targets; when it's a divergent drop for the active
  // target (e.g. a customized ruleset on Ubuntu) the group is marked + annotated.
  const firewallFields = (
    <>
      <div className="flex items-end">
        <ToggleField
          label={t('field.firewallEnabled')}
          checked={firewall.enabled}
          onChange={(v) =>
            update((d) => {
              d.security.firewall.enabled = v
            })
          }
        />
      </div>
      {firewall.enabled && (
        <TextField
          label={t('field.firewallServices')}
          value={firewall.services.join(', ')}
          placeholder="ssh, http"
          onChange={(v) =>
            update((d) => {
              d.security.firewall.services = v
                .split(/[\s,]+/)
                .map((s) => s.trim())
                .filter(Boolean)
            })
          }
        />
      )}
    </>
  )

  return (
    <CollapsibleSection id="security" title={t('section.security')}>
      {isUbuntu ? (
        <SelectField
          label={t('field.apparmor')}
          value={apparmor}
          onChange={(v) =>
            update((d) => {
              d.security.apparmor = v as InstallSpec['security']['apparmor']
            })
          }
          options={['enforce', 'complain', 'disabled'].map((m) => ({ value: m, label: m }))}
        />
      ) : (
        <SelectField
          label={t('field.selinux')}
          value={selinux}
          onChange={(v) =>
            update((d) => {
              d.security.selinux = v as InstallSpec['security']['selinux']
            })
          }
          options={['enforcing', 'permissive', 'disabled'].map((m) => ({ value: m, label: m }))}
        />
      )}
      {drops.has('security.firewall') ? (
        <CrossFormatGroup>{firewallFields}</CrossFormatGroup>
      ) : (
        firewallFields
      )}
      <div className="flex items-end">
        <ToggleField
          label={t('field.permitRootLogin')}
          checked={sshHardening.permitRootLogin}
          onChange={(v) =>
            update((d) => {
              d.security.sshHardening.permitRootLogin = v
            })
          }
        />
      </div>
      <div className="flex items-end">
        <ToggleField
          label={t('field.passwordAuth')}
          checked={sshHardening.passwordAuth}
          onChange={(v) =>
            update((d) => {
              d.security.sshHardening.passwordAuth = v
            })
          }
        />
      </div>
    </CollapsibleSection>
  )
}
