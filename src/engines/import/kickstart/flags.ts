export type Flag = { key: string; value: string | null; raw: string }

const stripQuotes = (s: string): string =>
  (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))
    ? s.slice(1, -1)
    : s

/** Split on whitespace but keep quoted spans intact. */
function tokenize(args: string): string[] {
  return args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
}

/** Heuristic: a token looks like a value (not a plain positional) if it contains
 *  special characters (comma, equals, colon, slash, dot), or is already quoted. */
function looksLikeValue(token: string): boolean {
  return (
    /[,=/:.]/.test(token) ||
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  )
}

/** Parse a Kickstart command's argument string into flags + positionals. Pure.
 *  `--k=v` → {key:'k', value:'v'}; `--k v` → consumes the next token as value;
 *  bare `--flag` → value null; non-dashed tokens are positionals. `raw` preserves
 *  the original spelling for verbatim re-emit. */
export function parseFlags(args: string): { flags: Flag[]; positionals: string[] } {
  const tokens = tokenize(args)
  const flags: Flag[] = []
  const positionals: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as string
    if (!tok.startsWith('--')) {
      positionals.push(stripQuotes(tok))
      continue
    }
    const body = tok.slice(2)
    const eq = body.indexOf('=')
    if (eq >= 0) {
      flags.push({ key: body.slice(0, eq), value: stripQuotes(body.slice(eq + 1)), raw: tok })
      continue
    }
    const next = tokens[i + 1]
    if (next !== undefined && !next.startsWith('--') && looksLikeValue(next)) {
      flags.push({ key: body, value: stripQuotes(next), raw: `${tok} ${next}` })
      i++
    } else {
      flags.push({ key: body, value: null, raw: tok })
    }
  }
  return { flags, positionals }
}
