import { useSpec } from '@hooks/useSpec'
import { selectUi, useGeneratorStore } from '@store/generatorStore'
import { fromLines, toLines } from '@utils/format'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { TextAreaField, ToggleField } from './fields'

export function ScriptsSection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const { osFamily } = spec.target
  const isRhel = osFamily === 'rhel'
  const showRaw = useGeneratorStore(selectUi).showRawPanels
  const setShowRawPanels = useGeneratorStore((s) => s.setShowRawPanels)

  return (
    <CollapsibleSection id="scripts" title={t('section.scripts')}>
      <div className="sm:col-span-2">
        <TextAreaField
          label={isRhel ? t('field.preScripts') : t('field.earlyCommands')}
          value={toLines(isRhel ? spec.scripts.pre : spec.scripts.earlyCommands)}
          onChange={(v) =>
            update((d) => {
              if (isRhel) d.scripts.pre = fromLines(v)
              else d.scripts.earlyCommands = fromLines(v)
            })
          }
        />
      </div>
      <div className="sm:col-span-2">
        <TextAreaField
          label={isRhel ? t('field.postScripts') : t('field.lateCommands')}
          value={toLines(isRhel ? spec.scripts.post : spec.scripts.lateCommands)}
          onChange={(v) =>
            update((d) => {
              if (isRhel) d.scripts.post = fromLines(v)
              else d.scripts.lateCommands = fromLines(v)
            })
          }
        />
      </div>
      <div className="sm:col-span-2">
        <ToggleField label={t('field.showRaw')} checked={showRaw} onChange={setShowRawPanels} />
      </div>
      {showRaw && (
        <div className="grid gap-4 sm:col-span-2">
          {osFamily === 'rhel' && (
            <>
              <TextAreaField
                label={t('field.rawPre')}
                value={spec.scripts.rawKickstartPre}
                rows={3}
                onChange={(v) =>
                  update((d) => {
                    d.scripts.rawKickstartPre = v
                  })
                }
              />
              <TextAreaField
                label={t('field.rawPost')}
                value={spec.scripts.rawKickstartPost}
                rows={3}
                onChange={(v) =>
                  update((d) => {
                    d.scripts.rawKickstartPost = v
                  })
                }
              />
            </>
          )}
          {osFamily === 'ubuntu' && (
            <>
              <TextAreaField
                label={t('field.rawUserData')}
                value={spec.scripts.rawAutoinstallUserData}
                rows={3}
                onChange={(v) =>
                  update((d) => {
                    d.scripts.rawAutoinstallUserData = v
                  })
                }
              />
              <TextAreaField
                label={t('field.rawStorage')}
                value={spec.scripts.rawAutoinstallStorage}
                rows={3}
                onChange={(v) =>
                  update((d) => {
                    d.scripts.rawAutoinstallStorage = v
                  })
                }
              />
            </>
          )}
          {osFamily === 'debian' && (
            <TextAreaField
              label={t('field.rawPreseed')}
              value={spec.scripts.rawPreseed}
              rows={3}
              onChange={(v) =>
                update((d) => {
                  d.scripts.rawPreseed = v
                })
              }
            />
          )}
        </div>
      )}
    </CollapsibleSection>
  )
}
