import type { InstallSpec } from '../../model/installSpec'

type UnknownFlags = InstallSpec['passthrough']['kickstart']['unknownFlags']
type ExtraSections = InstallSpec['passthrough']['kickstart']['extraSections']

const firstWord = (line: string): string => line.split(/\s+/)[0] ?? ''

/** Append each entry's flags to the entry.index-th line whose command matches. Pure. */
export function applyUnknownFlags(commands: string[], unknownFlags: UnknownFlags): string[] {
  const out = [...commands]
  for (const { command, index, flags } of unknownFlags) {
    let seen = -1
    for (let i = 0; i < out.length; i++) {
      if (firstWord(out[i] ?? '') === command && ++seen === index) {
        out[i] = `${out[i]} ${flags.join(' ')}`
        break
      }
    }
  }
  return out
}

/** Render extra %sections (header + optional body + %end) verbatim. Pure. */
export function extraSectionBlocks(sections: ExtraSections): string[] {
  return sections.flatMap(({ header, body }) => (body ? [header, body, '%end'] : [header, '%end']))
}
