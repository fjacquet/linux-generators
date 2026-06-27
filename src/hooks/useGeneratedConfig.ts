import type { EmitResult } from '@engines/emit'
import { emitKickstart } from '@engines/emit'
import { selectSpec, selectTargetFormat, useGeneratorStore } from '@store/generatorStore'
import { useMemo } from 'react'

// THE single sanctioned useMemo (mirrors vatlas's useEstateView). The spec is
// replaced on every edit, so this recomputes per keystroke → live preview.
// No component may add its own useMemo over the spec.
export function useGeneratedConfig(): EmitResult {
  const spec = useGeneratorStore(selectSpec)
  const format = useGeneratorStore(selectTargetFormat)

  return useMemo<EmitResult>(() => {
    // Phase 2 adds the autoinstall engine + validation diagnostics here.
    switch (format) {
      case 'kickstart':
        return emitKickstart(spec)
      case 'autoinstall':
        return emitKickstart(spec)
    }
  }, [spec, format])
}
