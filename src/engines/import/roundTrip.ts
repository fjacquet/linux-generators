import { diffLines } from '../../utils/diff'
import { emit } from '../emit'
import type { InstallSpec, TargetFormat } from '../model/installSpec'
import type { Fidelity, RoundTripResult } from './types'

/** A line that carries semantic meaning (not a comment or blank). */
const isCosmetic = (line: string): boolean => {
  const t = line.trim()
  return t === '' || t.startsWith('#')
}

const normalize = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => !isCosmetic(l))
    .sort() // order-insensitive semantic comparison

function classify(original: string, reemitted: string): Fidelity {
  const a = normalize(original)
  const b = new Set(normalize(reemitted))
  if (a.length === b.size && a.every((l) => b.has(l))) {
    // same multiset of semantic lines → exact iff raw texts match, else semantic
    return original.trim() === reemitted.trim() ? 'exact' : 'semantic'
  }
  // any semantic line in the original missing from the re-emit → semantic or exact, else lossy
  return a.every((l) => b.has(l))
    ? original.trim() === reemitted.trim()
      ? 'exact'
      : 'semantic'
    : 'lossy'
}

/** Re-emit the imported spec and compare to the original to prove fidelity. Pure. */
export function roundTrip(
  originalText: string,
  spec: InstallSpec,
  format: TargetFormat,
): RoundTripResult {
  const reemitted = emit(spec, format).files[0]?.content ?? ''
  return { fidelity: classify(originalText, reemitted), diff: diffLines(originalText, reemitted) }
}
