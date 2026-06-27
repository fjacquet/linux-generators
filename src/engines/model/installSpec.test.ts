import { describe, expect, it } from 'vitest'
import {
  defaultTargetForFormat,
  formatForOsFamily,
  InstallSpecSchema,
  type TargetFormat,
} from './installSpec'

describe('format ⇄ os-family mapping', () => {
  it('maps each format to its os family and back (1:1, all three formats)', () => {
    const cases: { format: TargetFormat; osFamily: string }[] = [
      { format: 'kickstart', osFamily: 'rhel' },
      { format: 'autoinstall', osFamily: 'ubuntu' },
      { format: 'preseed', osFamily: 'debian' },
    ]
    for (const { format, osFamily } of cases) {
      const target = defaultTargetForFormat(format)
      expect(target.osFamily).toBe(osFamily)
      // round-trip: the default target's family resolves back to the same format
      expect(formatForOsFamily(target.osFamily)).toBe(format)
    }
  })

  it('produces a schema-valid default target for Debian/preseed', () => {
    const target = defaultTargetForFormat('preseed')
    expect(target).toEqual({ osFamily: 'debian', distro: 'debian', version: '13' })
    // the seed target must parse under the full schema (fills in arch/firmware defaults)
    expect(InstallSpecSchema.shape.target.safeParse(target).success).toBe(true)
  })
})

describe('Scripts.rawPreseed', () => {
  it('defaults to an empty string', () => {
    const spec = InstallSpecSchema.parse({
      schemaVersion: 1,
      target: defaultTargetForFormat('preseed'),
      locale: {},
      network: {},
      storage: {},
      identity: {},
      packages: {},
      security: {},
      scripts: {},
      meta: {},
    })
    expect(spec.scripts.rawPreseed).toBe('')
  })
})
