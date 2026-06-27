type Json = Record<string, unknown>

const isPlainObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Merge two plain objects with WINNER precedence. Two plain objects merge
 * recursively; for any other pairing (array or primitive on either side) the
 * winner's value replaces the loser's — never concatenates arrays. Pure.
 */
export function deepMerge(winner: Json, loser: Json): Json {
  const out: Json = { ...loser }
  for (const [key, wVal] of Object.entries(winner)) {
    const lVal = out[key]
    out[key] = isPlainObject(wVal) && isPlainObject(lVal) ? deepMerge(wVal, lVal) : wVal
  }
  return out
}
