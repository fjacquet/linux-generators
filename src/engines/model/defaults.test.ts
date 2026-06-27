import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEC, freshDefaultSpec } from './defaults'
import { InstallSpecSchema } from './installSpec'

describe('DEFAULT_SPEC', () => {
  it('is a valid InstallSpec', () => {
    expect(InstallSpecSchema.safeParse(DEFAULT_SPEC).success).toBe(true)
  })

  it('uses the SSH-key-first secure default (locked root, enforcing SELinux)', () => {
    expect(DEFAULT_SPEC.identity.rootPolicy).toBe('locked')
    expect(DEFAULT_SPEC.security.selinux).toBe('enforcing')
    expect(DEFAULT_SPEC.storage.scheme).toBe('autopart-lvm')
  })
})

describe('freshDefaultSpec', () => {
  it('returns an independently-mutable copy', () => {
    const a = freshDefaultSpec()
    const b = freshDefaultSpec()
    a.network.hostname = 'mutated'
    expect(b.network.hostname).toBe('localhost.localdomain')
    expect(a).not.toBe(b)
  })
})
