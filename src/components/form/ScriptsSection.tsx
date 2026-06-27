import { useSpec } from '@hooks/useSpec'
import { selectUi, useGeneratorStore } from '@store/generatorStore'
import { fromLines, toLines } from '@utils/format'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { TextAreaField, ToggleField } from './fields'

export function ScriptsSection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const isUbuntu = spec.target.osFamily === 'ubuntu'
  const showRaw = useGeneratorStore(selectUi).showRawPanels
  const setShowRawPanels = useGeneratorStore((s) => s.setShowRawPanels)

  return (
    <CollapsibleSection id="scripts" title={t('section.scripts')}>
      <div className="sm:col-span-2">
        <TextAreaField
          label={isUbuntu ? t('field.earlyCommands') : t('field.preScripts')}
          value={toLines(isUbuntu ? spec.scripts.earlyCommands : spec.scripts.pre)}
          onChange={(v) =>
            update((d) => {
              if (isUbuntu) d.scripts.earlyCommands = fromLines(v)
              else d.scripts.pre = fromLines(v)
            })
          }
        />
      </div>
      <div className="sm:col-span-2">
        <TextAreaField
          label={isUbuntu ? t('field.lateCommands') : t('field.postScripts')}
          value={toLines(isUbuntu ? spec.scripts.lateCommands : spec.scripts.post)}
          onChange={(v) =>
            update((d) => {
              if (isUbuntu) d.scripts.lateCommands = fromLines(v)
              else d.scripts.post = fromLines(v)
            })
          }
        />
      </div>
      <div className="sm:col-span-2">
        <ToggleField label={t('field.showRaw')} checked={showRaw} onChange={setShowRawPanels} />
      </div>
      {showRaw && (
        <div className="grid gap-4 sm:col-span-2">
          {isUbuntu ? (
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
          ) : (
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
        </div>
      )}
    </CollapsibleSection>
  )
}
