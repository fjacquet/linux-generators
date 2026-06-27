// src/engines/import/kickstart/tokenize.ts
export type KsNode =
  | { kind: 'command'; name: string; args: string; index: number; raw: string }
  | { kind: 'section'; header: string; body: string }
  | { kind: 'comment'; raw: string }
  | { kind: 'blank' }

const SECTION_RE = /^%(packages|pre|pre-install|post|addon|anaconda|onerror|traceback)\b/

/** Fold one command's trailing-backslash continuations into a single logical
 *  line, starting at `start`. Returns the merged line and the index just past
 *  the last raw line consumed. Continuation folding is applied to COMMAND lines
 *  only — never to section bodies, which must stay verbatim. */
function joinCommandContinuation(lines: string[], start: number): { line: string; next: number } {
  let acc = ''
  let i = start
  while (i < lines.length) {
    const line = lines[i] as string
    const cont = line.endsWith('\\')
    const piece = cont ? line.slice(0, -1).trimEnd() : line
    acc = acc === '' ? piece : `${acc} ${piece.trim()}`
    i++
    if (!cont) break
  }
  return { line: acc, next: i }
}

/** Tokenize a Kickstart file into ordered nodes. Pure. Sections collect their
 *  body until %end; each command carries its 0-based per-command occurrence index. */
export function tokenizeKickstart(text: string): KsNode[] {
  const lines = text.split('\n')
  const nodes: KsNode[] = []
  const counts = new Map<string, number>()
  let i = 0
  while (i < lines.length) {
    const line = lines[i] as string
    if (SECTION_RE.test(line)) {
      const header = line.trim()
      const body: string[] = []
      i++
      while (i < lines.length && (lines[i] as string).trim() !== '%end') {
        // Capture the body verbatim: no continuation folding (a backslash inside
        // a %pre/%post script is the user's content) and no trimming (leading
        // indentation and edge blank lines must survive the round-trip).
        body.push(lines[i] as string)
        i++
      }
      if (i < lines.length) i++ // consume the %end line
      nodes.push({ kind: 'section', header, body: body.join('\n') })
      continue
    }
    if (line.trim() === '') {
      nodes.push({ kind: 'blank' })
      i++
      continue
    }
    if (line.trimStart().startsWith('#')) {
      nodes.push({ kind: 'comment', raw: line })
      i++
      continue
    }
    // Command line — fold its own trailing-backslash continuations only.
    const { line: folded, next } = joinCommandContinuation(lines, i)
    i = next
    const trimmed = folded.trim()
    const name = trimmed.split(/\s+/)[0] as string
    const args = trimmed.slice(name.length).trim()
    const index = counts.get(name) ?? 0
    counts.set(name, index + 1)
    nodes.push({ kind: 'command', name, args, index, raw: trimmed })
  }
  return nodes
}
