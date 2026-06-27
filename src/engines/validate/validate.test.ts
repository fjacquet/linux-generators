import { freshDefaultSpec, type InstallSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { validate } from './index'
import { validateAutoinstall } from './validateAutoinstall'
import { validateKickstart } from './validateKickstart'

const ubuntu = (mutate: (d: InstallSpec) => void): InstallSpec => {
  const s = freshDefaultSpec()
  Object.assign(s.target, { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' })
  mutate(s)
  return s
}

const fields = (spec: InstallSpec, fn: typeof validateKickstart) => fn(spec).map((d) => d.field)

describe('validateKickstart', () => {
  it('passes a sane default spec', () => {
    expect(validateKickstart(freshDefaultSpec())).toEqual([])
  })

  it('errors when a static interface has no IP', () => {
    const s = freshDefaultSpec()
    s.network.interfaces = [
      { device: 'eth0', mode: 'static', ip: '', prefix: 24, gateway: '', nameservers: [] },
    ]
    expect(fields(s, validateKickstart)).toContain('network.interfaces.0.ip')
  })

  it('errors when root password policy has no hash', () => {
    const s = freshDefaultSpec()
    s.identity.rootPolicy = 'password'
    expect(fields(s, validateKickstart)).toContain('identity.rootPasswordCrypt')
  })

  it('warns when manual storage defines no partitions', () => {
    const s = freshDefaultSpec()
    s.storage.scheme = 'manual'
    expect(fields(s, validateKickstart)).toContain('storage.partitions')
  })

  it('warns when manual storage has no root partition', () => {
    const s = freshDefaultSpec()
    s.storage.scheme = 'manual'
    s.storage.partitions = [{ mountpoint: '/boot', size: '1024', fstype: 'xfs', grow: false }]
    expect(fields(s, validateKickstart)).toContain('storage.partitions')
  })

  it('warns when encryption is enabled without a passphrase', () => {
    const s = freshDefaultSpec()
    s.storage.encryption = { enabled: true, passphrase: '' }
    expect(fields(s, validateKickstart)).toContain('storage.encryption.passphrase')
  })
})

describe('validateAutoinstall', () => {
  it('errors when there is no way to log in (default key-less spec)', () => {
    const errs = validateAutoinstall(ubuntu(() => {}))
    expect(errs.map((d) => d.field)).toContain('identity.primaryUser.sshKeys')
  })

  it('accepts a spec with an SSH key', () => {
    const s = ubuntu((d) => {
      d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAA admin@host']
    })
    expect(validateAutoinstall(s)).toEqual([])
  })

  it('errors when encrypted storage has no passphrase', () => {
    const s = ubuntu((d) => {
      d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAA admin@host']
      d.storage.encryption = { enabled: true, passphrase: '' }
    })
    expect(validateAutoinstall(s).map((d) => d.field)).toContain('storage.encryption.passphrase')
  })

  it('errors when the hostname is empty', () => {
    const s = ubuntu((d) => {
      d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAA admin@host']
      d.network.hostname = ''
    })
    expect(validateAutoinstall(s).map((d) => d.field)).toContain('network.hostname')
  })
})

describe('validate dispatch', () => {
  it('routes to the kickstart rules for kickstart', () => {
    const s = freshDefaultSpec()
    s.identity.rootPolicy = 'password'
    expect(validate(s, 'kickstart').map((d) => d.field)).toContain('identity.rootPasswordCrypt')
  })
  it('routes to the autoinstall rules for autoinstall', () => {
    expect(
      validate(
        ubuntu(() => {}),
        'autoinstall',
      ).length,
    ).toBeGreaterThan(0)
  })
})
