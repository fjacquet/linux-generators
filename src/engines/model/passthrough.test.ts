// src/engines/model/passthrough.test.ts
import { describe, expect, it } from 'vitest'
import { freshDefaultSpec } from './defaults'
import { InstallSpecSchema } from './installSpec'

describe('passthrough field', () => {
  it('defaults to empty buckets on a fresh spec', () => {
    const p = freshDefaultSpec().passthrough
    expect(p.kickstart.extraCommands).toEqual([])
    expect(p.kickstart.unknownFlags).toEqual([])
    expect(p.kickstart.extraSections).toEqual([])
    expect(p.kickstart.rawStorage).toEqual([])
    expect(p.autoinstall.extraKeys).toEqual({})
  })

  it('parses an old profile that has no passthrough key (backward compatible)', () => {
    const old = { ...freshDefaultSpec() } as Record<string, unknown>
    delete old.passthrough
    const parsed = InstallSpecSchema.safeParse(old)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.passthrough.kickstart.rawStorage).toEqual([])
  })

  it('round-trips unknownFlags with an occurrence index', () => {
    const spec = freshDefaultSpec()
    spec.passthrough.kickstart.unknownFlags.push({
      command: 'network',
      index: 1,
      flags: ['--bindto=mac'],
    })
    const parsed = InstallSpecSchema.parse(spec)
    expect(parsed.passthrough.kickstart.unknownFlags[0]).toEqual({
      command: 'network',
      index: 1,
      flags: ['--bindto=mac'],
    })
  })
})
