// src/engines/import/importFile.ts
import { InstallSpecSchema, type TargetFormat } from '../model'
import { parseAutoinstall } from './autoinstall/parseAutoinstall'
import { detectFormat } from './detectFormat'
import { parseKickstart } from './kickstart/parseKickstart'
import { roundTrip } from './roundTrip'
import type { Fidelity, ImportResult, ParseResult } from './types'

const FIDELITY_RANK: Record<Fidelity, number> = { exact: 3, semantic: 2, lossy: 1 }

type OkResult = Extract<ImportResult, { ok: true }>
type Attempt = { result: OkResult } | { error: string }

/** Run one parser end-to-end (parse → validate → round-trip). Pure. */
function attempt(text: string, format: TargetFormat): Attempt {
  let parsed: ParseResult
  try {
    parsed = format === 'autoinstall' ? parseAutoinstall(text) : parseKickstart(text)
  } catch (e) {
    return { error: `Could not parse ${format} file: ${(e as Error).message}` }
  }
  // Backstop: handlers only write valid values, so this should always pass.
  const validated = InstallSpecSchema.safeParse(parsed.spec)
  if (!validated.success) {
    return {
      error: `Parsed ${format} spec failed validation: ${validated.error.issues[0]?.message ?? 'unknown'}`,
    }
  }
  const rt = roundTrip(text, validated.data, format)
  return {
    result: {
      ok: true,
      spec: validated.data,
      diagnostics: parsed.diagnostics,
      report: { ...rt, mappedCount: parsed.mappedCount, passthroughCount: parsed.passthroughCount },
    },
  }
}

/** An attempt is only usable if it mapped at least one setting. The Kickstart
 *  parser never throws (it routes everything unrecognized to passthrough), so a
 *  zero-mapped "success" means the file wasn't actually recognized — treat it as
 *  a failure so a genuinely malformed file still hard-fails. */
const usable = (a: Attempt): OkResult | null =>
  'result' in a && a.result.report.mappedCount > 0 ? a.result : null

/** Pick the better of two attempts: higher round-trip fidelity, then more mapped
 *  settings; the detected (primary) format wins ties. */
function bestOf(primary: Attempt, secondary: Attempt): ImportResult {
  const pr = usable(primary)
  const sr = usable(secondary)
  if (!pr && !sr) {
    if ('error' in primary) return { ok: false, error: primary.error }
    if ('error' in secondary) return { ok: false, error: secondary.error }
    return { ok: false, error: 'Could not recognize the file as Kickstart or Autoinstall.' }
  }
  if (!pr) return sr as OkResult
  if (!sr) return pr
  const fp = FIDELITY_RANK[pr.report.fidelity]
  const fs = FIDELITY_RANK[sr.report.fidelity]
  if (fp !== fs) return fp >= fs ? pr : sr
  return pr.report.mappedCount >= sr.report.mappedCount ? pr : sr
}

/** Parse a native install file back into an InstallSpec, with a fidelity report.
 *  Pure. Hard-fails only when neither parser can produce a valid spec.
 *
 *  Format detection is a hint, not a verdict: a file whose markers are ambiguous
 *  (or that fails to parse as the detected format) is also tried with the other
 *  parser, and whichever round-trips better is returned. An explicit `override`
 *  is authoritative and skips the fallback. */
export function importFile(text: string, override?: TargetFormat): ImportResult {
  if (text.trim() === '') return { ok: false, error: 'Empty input.' }

  if (override) {
    const a = attempt(text, override)
    return 'result' in a ? a.result : { ok: false, error: a.error }
  }

  const detection = detectFormat(text)
  const secondaryFormat: TargetFormat =
    detection.format === 'autoinstall' ? 'kickstart' : 'autoinstall'
  const primary = attempt(text, detection.format)

  // Trust a confident, non-lossy detection without the extra parse.
  if (
    'result' in primary &&
    detection.confidence >= 0.5 &&
    primary.result.report.fidelity !== 'lossy'
  ) {
    return primary.result
  }

  // Ambiguous, low-confidence, or lossy/failed → also try the other parser and
  // keep whichever round-trips better.
  return bestOf(primary, attempt(text, secondaryFormat))
}
