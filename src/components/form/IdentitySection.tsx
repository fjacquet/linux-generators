import { hashPassword } from '@engines/crypt'
import { type InstallSpec, ROOT_POLICIES } from '@engines/model'
import { useCrossFormatDrops } from '@hooks/useCrossFormatDrops'
import { useSpec } from '@hooks/useSpec'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { CrossFormatGroup } from './CrossFormatNote'
import { SelectField, TextAreaField, TextField, ToggleField } from './fields'
import { PasswordField } from './PasswordField'

const linesToKeys = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

export function IdentitySection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const drops = useCrossFormatDrops()
  const { rootPolicy, primaryUser } = spec.identity

  const rootLabel: Record<(typeof ROOT_POLICIES)[number], string> = {
    locked: t('option.rootLocked'),
    password: t('option.rootPassword'),
    sshkey: t('option.rootSshkey'),
  }

  // Root policy is shown on both targets; `password` is a divergent drop on
  // Autoinstall (today's emitter locks root), so the group is marked + annotated.
  const rootFields = (
    <>
      <SelectField
        label={t('field.rootPolicy')}
        value={rootPolicy}
        onChange={(v) =>
          update((d) => {
            d.identity.rootPolicy = v as InstallSpec['identity']['rootPolicy']
          })
        }
        options={ROOT_POLICIES.map((p) => ({ value: p, label: rootLabel[p] }))}
      />
      {rootPolicy === 'password' && (
        <div className="sm:col-span-2">
          <PasswordField
            label={t('field.rootPassword')}
            hasHash={Boolean(spec.identity.rootPasswordCrypt)}
            onSet={(value) =>
              update((d) => {
                d.identity.rootPasswordCrypt = hashPassword(value)
              })
            }
            onClear={() =>
              update((d) => {
                d.identity.rootPasswordCrypt = ''
              })
            }
          />
        </div>
      )}
    </>
  )

  return (
    <CollapsibleSection id="identity" title={t('section.identity')}>
      {drops.has('identity.rootPolicy') ? (
        <CrossFormatGroup>{rootFields}</CrossFormatGroup>
      ) : (
        rootFields
      )}
      <TextField
        label={t('field.username')}
        value={primaryUser.name}
        placeholder="admin"
        onChange={(v) =>
          update((d) => {
            d.identity.primaryUser.name = v
          })
        }
      />
      <TextField
        label={t('field.userGecos')}
        value={primaryUser.gecos}
        onChange={(v) =>
          update((d) => {
            d.identity.primaryUser.gecos = v
          })
        }
      />
      <div className="flex items-end">
        <ToggleField
          label={t('field.sudo')}
          checked={primaryUser.sudo}
          onChange={(v) =>
            update((d) => {
              d.identity.primaryUser.sudo = v
            })
          }
        />
      </div>
      <div className="sm:col-span-2">
        <PasswordField
          label={t('field.userPassword')}
          hasHash={primaryUser.passwordMode === 'hashed' && Boolean(primaryUser.passwordCrypt)}
          onSet={(value) =>
            update((d) => {
              d.identity.primaryUser.passwordCrypt = hashPassword(value)
              d.identity.primaryUser.passwordMode = 'hashed'
            })
          }
          onClear={() =>
            update((d) => {
              d.identity.primaryUser.passwordCrypt = ''
              d.identity.primaryUser.passwordMode = 'none'
            })
          }
        />
      </div>
      <div className="sm:col-span-2">
        <TextAreaField
          label={t('field.sshKeys')}
          value={primaryUser.sshKeys.join('\n')}
          rows={3}
          placeholder="ssh-ed25519 AAAA... user@host"
          onChange={(v) =>
            update((d) => {
              d.identity.primaryUser.sshKeys = linesToKeys(v)
            })
          }
        />
      </div>
    </CollapsibleSection>
  )
}
