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

/**
 * INVARIANT — LINE-LEVEL comparison is load-bearing for the "nothing silently lost" guarantee.
 *
 * Because the emitter is deterministic from the spec, any content that cannot be represented
 * in the spec cannot reappear in the re-emit. A line-level diff therefore surfaces every such
 * dropped construct as `lossy`.
 *
 * DO NOT move to token-level or semantic classification without first ensuring that every
 * dropped construct (command flags, %packages/%pre/%post header flags, unmodeled netplan fields,
 * etc.) lands in a passthrough bucket so it survives the round-trip. Without that guarantee a
 * token/semantic classifier would silently report genuine content losses as `semantic` or `exact`.
 *
 * Classify fidelity between original and re-emitted text.
 *
 * 'exact'    — byte-identical after trim (fast path, no multiset walk needed).
 * 'semantic' — every non-cosmetic line of the original is present in the re-emit
 *              with at least the same frequency (nothing lost, only cosmetic diffs).
 * 'lossy'    — at least one non-cosmetic line from the original has no remaining
 *              count in the re-emit's frequency map (content was silently dropped).
 */
export function classifyFidelity(originalText: string, reemittedText: string): Fidelity {
  if (originalText.trim() === reemittedText.trim()) return 'exact'

  const originalLines = normalize(originalText)
  const reemitLines = normalize(reemittedText)

  // Build a frequency map of the re-emit's non-cosmetic lines so that duplicate
  // counts are tracked independently. A Set-based approach would mask the case
  // where the original has a line N times but the re-emit has it only M < N times.
  const freq = new Map<string, number>()
  for (const line of reemitLines) {
    freq.set(line, (freq.get(line) ?? 0) + 1)
  }

  // Walk every original non-cosmetic line and consume one slot from the map.
  // If the count is already 0 (or the key is absent) the re-emit dropped that
  // occurrence → lossy.
  for (const line of originalLines) {
    const count = freq.get(line) ?? 0
    if (count === 0) return 'lossy'
    freq.set(line, count - 1)
  }

  return 'semantic'
}

/** Re-emit the imported spec and compare to the original to prove fidelity. Pure. */
export function roundTrip(
  originalText: string,
  spec: InstallSpec,
  format: TargetFormat,
): RoundTripResult {
  const reemitted = emit(spec, format).files[0]?.content ?? ''
  return {
    fidelity: classifyFidelity(originalText, reemitted),
    diff: diffLines(originalText, reemitted),
  }
}
