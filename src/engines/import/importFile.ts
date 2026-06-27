// src/engines/import/importFile.ts
import { type InstallSpec, InstallSpecSchema, type TargetFormat } from '../model'
import type { Diagnostic } from '../types'
import { parseAutoinstall } from './autoinstall/parseAutoinstall'
import { detectFormat } from './detectFormat'
import { parseKickstart } from './kickstart/parseKickstart'
import { roundTrip } from './roundTrip'
import type { Fidelity, ImportResult, OkResult } from './types'

const FIDELITY_RANK: Record<Fidelity, number> = { exact: 3, semantic: 2, lossy: 1 }

/** A parsed + validated spec, before the (expensive) round-trip is computed. */
type Parsed = {
  format: TargetFormat
  spec: InstallSpec
  diagnostics: Diagnostic[]
  mappedCount: number
  passthroughCount: number
}
type Attempt = { parsed: Parsed } | { error: string }

/** Parse and validate with one parser. Pure. Does NOT round-trip — that is
 *  deferred to `finalize` so a discarded attempt never pays for a re-emit. */
function attempt(text: string, format: TargetFormat): Attempt {
  let spec: InstallSpec
  let diagnostics: Diagnostic[]
  let mappedCount: number
  let passthroughCount: number
  try {
    const parsed = format === 'autoinstall' ? parseAutoinstall(text) : parseKickstart(text)
    ;({ diagnostics, mappedCount, passthroughCount } = parsed)
    // Backstop: handlers only write valid values, so this should always pass.
    const validated = InstallSpecSchema.safeParse(parsed.spec)
    if (!validated.success) {
      return {
        error: `Parsed ${format} spec failed validation: ${validated.error.issues[0]?.message ?? 'unknown'}`,
      }
    }
    spec = validated.data
  } catch (e) {
    return { error: `Could not parse ${format} file: ${(e as Error).message}` }
  }
  return { parsed: { format, spec, diagnostics, mappedCount, passthroughCount } }
}

/** An attempt is only usable if it mapped at least one setting. The Kickstart
 *  parser never throws (it routes everything unrecognized to passthrough), so a
 *  zero-mapped "success" means the file wasn't actually recognized — treat it as
 *  a failure so a genuinely malformed file still hard-fails. */
const usable = (a: Attempt): Parsed | null =>
  'parsed' in a && a.parsed.mappedCount > 0 ? a.parsed : null

/** Round-trip the parsed spec and assemble the final report. */
function finalize(p: Parsed, text: string): OkResult {
  const rt = roundTrip(text, p.spec, p.format)
  return {
    ok: true,
    spec: p.spec,
    diagnostics: p.diagnostics,
    report: { ...rt, mappedCount: p.mappedCount, passthroughCount: p.passthroughCount },
  }
}

/** Higher round-trip fidelity wins, then more mapped settings; `a` (the detected
 *  format) keeps ties. */
const better = (a: OkResult, b: OkResult): OkResult => {
  const fa = FIDELITY_RANK[a.report.fidelity]
  const fb = FIDELITY_RANK[b.report.fidelity]
  if (fa !== fb) return fa > fb ? a : b
  return a.report.mappedCount >= b.report.mappedCount ? a : b
}

/** Parse a native install file back into an InstallSpec, with a fidelity report.
 *  Pure. Hard-fails only when neither parser can produce a valid, content-bearing
 *  spec.
 *
 *  Format detection is a hint, not a verdict: a file whose markers are ambiguous
 *  (or that fails to parse as the detected format) is also tried with the other
 *  parser, and whichever round-trips better is returned. An explicit `override`
 *  is authoritative and skips the fallback. */
export function importFile(text: string, override?: TargetFormat): ImportResult {
  if (text.trim() === '') return { ok: false, error: 'Empty input.' }

  if (override) {
    const a = attempt(text, override)
    return 'parsed' in a ? finalize(a.parsed, text) : { ok: false, error: a.error }
  }

  const detection = detectFormat(text)
  const secondaryFormat: TargetFormat =
    detection.format === 'autoinstall' ? 'kickstart' : 'autoinstall'

  const primary = attempt(text, detection.format)
  const primaryParsed = usable(primary)
  const primaryFinal = primaryParsed ? finalize(primaryParsed, text) : null

  // Trust a confident, non-lossy detection without running the other parser.
  if (primaryFinal && detection.confidence >= 0.5 && primaryFinal.report.fidelity !== 'lossy') {
    return primaryFinal
  }

  // Ambiguous, low-confidence, or lossy/failed → also try the other parser and
  // keep whichever round-trips better. Only usable (>0 mapped) attempts are
  // round-tripped.
  const secondary = attempt(text, secondaryFormat)
  const secondaryParsed = usable(secondary)
  const secondaryFinal = secondaryParsed ? finalize(secondaryParsed, text) : null

  const finals = [primaryFinal, secondaryFinal].filter((r): r is OkResult => r !== null)
  if (finals.length === 0) {
    const err = ('error' in primary && primary.error) || ('error' in secondary && secondary.error)
    return { ok: false, error: err || 'Could not recognize the file as Kickstart or Autoinstall.' }
  }
  return finals.reduce(better)
}
