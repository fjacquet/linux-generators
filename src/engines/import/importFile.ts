// src/engines/import/importFile.ts
import { InstallSpecSchema, type TargetFormat } from '../model'
import { parseAutoinstall } from './autoinstall/parseAutoinstall'
import { detectFormat } from './detectFormat'
import { parseKickstart } from './kickstart/parseKickstart'
import { roundTrip } from './roundTrip'
import type { ImportResult, ParseResult } from './types'

/** Parse a native install file back into an InstallSpec, with a fidelity report.
 *  Pure. Hard-fails only on unparseable structure; content issues become warnings. */
export function importFile(text: string, override?: TargetFormat): ImportResult {
  if (text.trim() === '') return { ok: false, error: 'Empty input.' }
  const detected = override ?? detectFormat(text).format

  let parsed: ParseResult
  try {
    parsed = detected === 'autoinstall' ? parseAutoinstall(text) : parseKickstart(text)
  } catch (e) {
    return { ok: false, error: `Could not parse ${detected} file: ${(e as Error).message}` }
  }

  // Backstop: handlers only write valid values, so this should always pass.
  const validated = InstallSpecSchema.safeParse(parsed.spec)
  if (!validated.success) {
    return {
      ok: false,
      error: `Parsed spec failed validation: ${validated.error.issues[0]?.message ?? 'unknown'}`,
    }
  }

  const rt = roundTrip(text, validated.data, detected)
  return {
    ok: true,
    spec: validated.data,
    diagnostics: parsed.diagnostics,
    report: { ...rt, mappedCount: parsed.mappedCount, passthroughCount: parsed.passthroughCount },
  }
}
