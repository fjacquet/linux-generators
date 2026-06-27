import type { Detection } from './types'

const AUTOINSTALL_MARKERS = [/^#cloud-config\b/m, /^autoinstall\s*:/m, /^\s*version\s*:\s*1\b/m]
const KICKSTART_MARKERS = [
  /^%(packages|pre|post|addon|end)\b/m,
  /^(lang|keyboard|rootpw|autopart|clearpart|bootloader|zerombr)\b/m,
]

const score = (text: string, markers: RegExp[]): number =>
  markers.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)

/** Sniff the file format. Confidence is the winning side's marker hit-rate. Pure. */
export function detectFormat(text: string): Detection {
  const ai = score(text, AUTOINSTALL_MARKERS)
  const ks = score(text, KICKSTART_MARKERS)
  if (ai >= ks) return { format: 'autoinstall', confidence: ai / AUTOINSTALL_MARKERS.length }
  return { format: 'kickstart', confidence: ks / KICKSTART_MARKERS.length }
}
