import { useSpec } from '@hooks/useSpec'
import { fromLines, toLines } from '@utils/format'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { TextAreaField, TextField } from './fields'

export function PackagesSection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const isUbuntu = spec.target.osFamily === 'ubuntu'

  return (
    <CollapsibleSection id="packages" title={t('section.packages')}>
      <div className="sm:col-span-2">
        <TextAreaField
          label={t('field.individualPkgs')}
          value={toLines(spec.packages.individual)}
          rows={3}
          placeholder={'vim\ncurl\ntmux'}
          onChange={(v) =>
            update((d) => {
              d.packages.individual = fromLines(v)
            })
          }
        />
      </div>
      {isUbuntu ? (
        <TextField
          label={t('field.aptMirror')}
          value={spec.packages.aptMirror}
          placeholder="http://archive.ubuntu.com/ubuntu"
          onChange={(v) =>
            update((d) => {
              d.packages.aptMirror = v
            })
          }
        />
      ) : (
        <>
          <div className="sm:col-span-2">
            <TextAreaField
              label={t('field.groups')}
              value={toLines(spec.packages.groups)}
              rows={2}
              placeholder={'@^minimal-environment\n@core'}
              onChange={(v) =>
                update((d) => {
                  d.packages.groups = fromLines(v)
                })
              }
            />
          </div>
          <TextField
            label={t('field.installUrl')}
            value={spec.packages.installUrl}
            placeholder="https://mirror.example/os"
            onChange={(v) =>
              update((d) => {
                d.packages.installUrl = v
              })
            }
          />
        </>
      )}
    </CollapsibleSection>
  )
}
