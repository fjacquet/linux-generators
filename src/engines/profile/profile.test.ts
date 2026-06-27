import { freshDefaultSpec, InstallSpecSchema } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { deserialize } from './deserialize'
import { PRESET_NAMES, PRESETS } from './presets'
import { serialize } from './serialize'

describe('serialize / deserialize', () => {
  it('round-trips a spec exactly', () => {
    const spec = freshDefaultSpec()
    spec.network.hostname = 'rt.example'
    spec.packages.individual = ['vim', 'curl']
    const result = deserialize(serialize(spec))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec).toEqual(spec)
  })

  it('reports an error for non-JSON input', () => {
    const result = deserialize('not json {')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/JSON/)
  })

  it('reports an error for a structurally invalid profile', () => {
    expect(deserialize('{"schemaVersion": 2}').ok).toBe(false)
  })
})

describe('PRESETS', () => {
  it.each(PRESET_NAMES)('%s is a valid InstallSpec', (name) => {
    expect(InstallSpecSchema.safeParse(PRESETS[name]).success).toBe(true)
  })

  it('cloud-init targets Ubuntu', () => {
    expect(PRESETS['cloud-init'].target.osFamily).toBe('ubuntu')
  })

  it('hardened-cis enforces SELinux and SSH hardening', () => {
    expect(PRESETS['hardened-cis'].security.selinux).toBe('enforcing')
    expect(PRESETS['hardened-cis'].security.sshHardening.permitRootLogin).toBe(false)
  })
})
