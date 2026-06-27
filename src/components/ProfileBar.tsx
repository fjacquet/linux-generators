import { deserialize, PRESET_NAMES, PRESETS, type PresetName, serialize } from '@engines/profile'
import { selectSpec, selectUi, useGeneratorStore } from '@store/generatorStore'
import { downloadText } from '@utils/download'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

const PRESET_LABELS: Record<PresetName, string> = {
  minimal: 'Minimal',
  'hardened-cis': 'Hardened (CIS)',
  'cloud-init': 'Cloud-init',
}

export function ProfileBar() {
  const { t } = useTranslation()
  const spec = useGeneratorStore(selectSpec)
  const ui = useGeneratorStore(selectUi)
  const loadProfile = useGeneratorStore((s) => s.loadProfile)
  const setDraftAutosave = useGeneratorStore((s) => s.setDraftAutosave)
  const fileRef = useRef<HTMLInputElement>(null)

  const onExport = () => downloadText(`${spec.meta.profileName || 'profile'}.json`, serialize(spec))

  const onImport = async (file: File) => {
    const result = deserialize(await file.text())
    if (result.ok) {
      loadProfile(result.spec)
      toast.success(t('profile.imported'))
    } else {
      toast.error(`${t('profile.importError')}: ${result.error}`)
    }
  }

  const onPreset = (value: string) => {
    if (!value) return
    loadProfile(structuredClone(PRESETS[value as PresetName]))
    toast.success(t('profile.presetLoaded'))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="btn-ghost"
        defaultValue=""
        aria-label={t('profile.preset')}
        onChange={(e) => {
          onPreset(e.target.value)
          e.target.value = ''
        }}
      >
        <option value="" disabled>
          {t('profile.preset')}…
        </option>
        {PRESET_NAMES.map((name) => (
          <option key={name} value={name}>
            {PRESET_LABELS[name]}
          </option>
        ))}
      </select>
      <button type="button" className="btn-ghost" onClick={onExport}>
        {t('profile.export')}
      </button>
      <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
        {t('profile.import')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImport(file)
          e.target.value = ''
        }}
      />
      <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          className="size-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          checked={ui.draftAutosave}
          onChange={(e) => setDraftAutosave(e.target.checked)}
        />
        {t('profile.autosave')}
      </label>
    </div>
  )
}
