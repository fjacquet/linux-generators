import { ARCHES, formatForOsFamily, type InstallSpec } from '@engines/model'
import { useSpec } from '@hooks/useSpec'
import { useGeneratorStore } from '@store/generatorStore'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from './CollapsibleSection'
import { SelectField } from './fields'

const DISTROS_BY_FAMILY: Record<InstallSpec['target']['osFamily'], string[]> = {
  rhel: ['rhel', 'fedora', 'rocky', 'alma'],
  ubuntu: ['ubuntu'],
  // Debian ships a single distro id.
  debian: ['debian'],
}

const DEFAULT_VERSION: Record<string, string> = {
  rhel: '9',
  fedora: '41',
  rocky: '9',
  alma: '9',
  ubuntu: '24.04',
  debian: '13',
}

export function TargetSection() {
  const { t } = useTranslation()
  const [spec, update] = useSpec()
  const chooseFormat = useGeneratorStore((s) => s.chooseFormat)
  const { osFamily, distro, version, arch, firmware } = spec.target

  // Family ⇄ format is 1:1; delegate to the store so the two stay in sync.
  const changeFamily = (next: string) =>
    chooseFormat(formatForOsFamily(next as InstallSpec['target']['osFamily']))

  return (
    <CollapsibleSection id="target" title={t('section.target')}>
      <SelectField
        label={t('field.osFamily')}
        value={osFamily}
        onChange={changeFamily}
        options={[
          { value: 'rhel', label: 'RHEL / Fedora' },
          { value: 'ubuntu', label: 'Ubuntu' },
          { value: 'debian', label: 'Debian' },
        ]}
      />
      <SelectField
        label={t('field.distro')}
        value={distro}
        onChange={(v) =>
          update((d) => {
            d.target.distro = v as InstallSpec['target']['distro']
            d.target.version = DEFAULT_VERSION[v] ?? d.target.version
          })
        }
        options={(DISTROS_BY_FAMILY[osFamily] ?? []).map((v) => ({ value: v, label: v }))}
      />
      <SelectField
        label={t('field.version')}
        value={version}
        onChange={(v) =>
          update((d) => {
            d.target.version = v
          })
        }
        options={versionOptions(distro)}
      />
      <SelectField
        label={t('field.arch')}
        value={arch}
        onChange={(v) =>
          update((d) => {
            d.target.arch = v as InstallSpec['target']['arch']
          })
        }
        options={ARCHES.map((a) => ({ value: a, label: a }))}
      />
      <SelectField
        label={t('field.firmware')}
        value={firmware}
        onChange={(v) =>
          update((d) => {
            d.target.firmware = v as InstallSpec['target']['firmware']
          })
        }
        options={[
          { value: 'uefi', label: t('option.fwUefi') },
          { value: 'bios', label: t('option.fwBios') },
        ]}
      />
    </CollapsibleSection>
  )
}

function versionOptions(distro: string): { value: string; label: string }[] {
  const versions: Record<string, string[]> = {
    rhel: ['10', '9'],
    rocky: ['10', '9'],
    alma: ['10', '9'],
    fedora: ['41', '40'],
    ubuntu: ['24.04', '22.04'],
    debian: ['13', '12'],
  }
  return (versions[distro] ?? ['9']).map((v) => ({ value: v, label: v }))
}
