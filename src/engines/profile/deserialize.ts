import { type InstallSpec, InstallSpecSchema } from '../model'

export type DeserializeResult = { ok: true; spec: InstallSpec } | { ok: false; error: string }

/** Parse + validate an imported profile. schemaVersion is a literal 1 today;
 *  future migrations slot in here before the safeParse. */
export function deserialize(json: string): DeserializeResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }

  const parsed = InstallSpecSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Not a valid profile.',
    }
  }
  return { ok: true, spec: parsed.data }
}
