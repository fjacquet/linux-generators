import { freshDefaultSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { quirksFor, versionNumber } from './quirks'

function tgt(osFamily: 'rhel' | 'ubuntu', distro: string, version: string) {
  const t = freshDefaultSpec().target
  t.osFamily = osFamily
  t.distro = distro as typeof t.distro
  t.version = version
  return t
}

describe('versionNumber', () => {
  it('parses numeric versions', () => {
    expect(versionNumber('24.04')).toBeCloseTo(24.04)
    expect(versionNumber('9')).toBe(9)
  })
  it('falls back to 0 for non-numeric versions', () => {
    expect(versionNumber('rolling')).toBe(0)
  })
})

describe('quirksFor', () => {
  it('rhel family uses authselect and is not unknown-key fatal', () => {
    const q = quirksFor(tgt('rhel', 'rhel', '10'))
    expect(q.authTool).toBe('authselect')
    expect(q.unknownKeysFatal).toBe(false)
    expect(q.netplanVersion).toBe(2)
  })
  it('Ubuntu 24.04+ treats unknown keys as fatal', () => {
    expect(quirksFor(tgt('ubuntu', 'ubuntu', '24.04')).unknownKeysFatal).toBe(true)
  })
  it('Ubuntu 22.04 does not treat unknown keys as fatal', () => {
    expect(quirksFor(tgt('ubuntu', 'ubuntu', '22.04')).unknownKeysFatal).toBe(false)
  })
})
