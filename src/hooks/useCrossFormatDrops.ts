import { crossFormatDrops } from '@engines/emit'
import { selectSpec, selectTargetFormat, useGeneratorStore } from '@store/generatorStore'

/**
 * The set of InstallSpec field paths whose intent the active target cannot emit.
 * Form sections use it to mark a field and show an inline "not emitted" note.
 *
 * Keyed on the same `targetFormat` and predicate the engines use for the
 * DiagnosticsList, so the inline note and the diagnostic never disagree. The set
 * is tiny and cheap to rebuild per render — no memo (only `useGeneratedConfig`
 * may memoize over the spec).
 */
export function useCrossFormatDrops(): Set<string> {
  const spec = useGeneratorStore(selectSpec)
  const format = useGeneratorStore(selectTargetFormat)
  return new Set(crossFormatDrops(spec, format).map((d) => d.field))
}
