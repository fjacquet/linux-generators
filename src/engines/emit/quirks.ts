import type { InstallSpec } from '../model/installSpec'

// Per-distro/version capability table. Engines read this (never `target`
// directly for behaviour) so version-conditional output stays in one place:
// pruning deprecated directives (RHEL 10 → authselect) and avoiding keys a
// stricter installer rejects (Ubuntu 24.04+ fails on unknown keys).

export interface Quirks {
  /** RHEL/Fedora auth tooling. `authconfig` was removed in Fedora 28+ / RHEL 8+. */
  authTool: 'authselect' | 'authconfig'
  /** Netplan schema version emitted under autoinstall `network`. */
  netplanVersion: number
  /** Ubuntu 24.04+ treats unrecognised autoinstall keys as fatal, not a warning. */
  unknownKeysFatal: boolean
}

/** Parse a distro version like '9', '24.04', '40' into a comparable number. */
export function versionNumber(version: string): number {
  const n = Number.parseFloat(version)
  return Number.isFinite(n) ? n : 0
}

export function quirksFor(target: InstallSpec['target']): Quirks {
  if (target.osFamily === 'ubuntu') {
    return {
      authTool: 'authselect',
      netplanVersion: 2,
      unknownKeysFatal: versionNumber(target.version) >= 24.04,
    }
  }
  if (target.osFamily === 'debian') {
    // Preseed (debconf) has no authselect/netplan/strict-key concepts; the
    // emitter doesn't read these, so neutral defaults are fine.
    return {
      authTool: 'authselect',
      netplanVersion: 2,
      unknownKeysFatal: false,
    }
  }
  // rhel family (rhel/fedora/rocky/alma): all supported versions use authselect.
  return {
    authTool: 'authselect',
    netplanVersion: 2,
    unknownKeysFatal: false,
  }
}
