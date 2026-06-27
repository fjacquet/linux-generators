import type { InstallSpec } from '@engines/model'
import { selectSpec, selectUpdate, useGeneratorStore } from '@store/generatorStore'

/** The spec + its immutable updater — the pair every form section needs. */
export function useSpec(): readonly [InstallSpec, (mutate: (draft: InstallSpec) => void) => void] {
  const spec = useGeneratorStore(selectSpec)
  const update = useGeneratorStore(selectUpdate)
  return [spec, update] as const
}
