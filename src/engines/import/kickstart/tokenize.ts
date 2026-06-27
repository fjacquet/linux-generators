// src/engines/import/kickstart/tokenize.ts
export type KsNode =
  | { kind: 'command'; name: string; args: string; index: number; raw: string }
  | { kind: 'section'; header: string; body: string }
  | { kind: 'comment'; raw: string }
  | { kind: 'blank' }

const SECTION_RE = /^%(packages|pre|pre-install|post|addon|anaconda|onerror|traceback)\b/

/** Merge trailing-backslash continuations into single logical lines. */
function joinContinuations(text: string): string[] {
  const raw = text.split('\n')
  const out: string[] = []
  let acc: string | null = null
  for (const line of raw) {
    const cont = line.endsWith('\\')
    const piece = cont ? line.slice(0, -1).trimEnd() : line
    acc = acc === null ? piece : `${acc} ${piece.trim()}`
    if (!cont) {
      out.push(acc)
      acc = null
    }
  }
  if (acc !== null) out.push(acc)
  return out
}

/** Tokenize a Kickstart file into ordered nodes. Pure. Sections collect their
 *  body until %end; each command carries its 0-based per-command occurrence index. */
export function tokenizeKickstart(text: string): KsNode[] {
  const lines = joinContinuations(text)
  const nodes: KsNode[] = []
  const counts = new Map<string, number>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (SECTION_RE.test(line)) {
      const header = line.trim()
      const body: string[] = []
      i++
      while (i < lines.length && (lines[i] as string).trim() !== '%end') {
        body.push(lines[i] as string)
        i++
      }
      nodes.push({ kind: 'section', header, body: body.join('\n').trim() })
      continue
    }
    if (line.trim() === '') {
      nodes.push({ kind: 'blank' })
      continue
    }
    if (line.trimStart().startsWith('#')) {
      nodes.push({ kind: 'comment', raw: line })
      continue
    }
    const name = line.trim().split(/\s+/)[0] as string
    const args = line.trim().slice(name.length).trim()
    const index = counts.get(name) ?? 0
    counts.set(name, index + 1)
    nodes.push({ kind: 'command', name, args, index, raw: line.trim() })
  }
  return nodes
}
