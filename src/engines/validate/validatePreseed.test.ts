import { defaultTargetForFormat, freshDefaultSpec, type InstallSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { validatePreseed } from './validatePreseed'

const debian = (mutate?: (d: InstallSpec) => void): InstallSpec => {
  const s = freshDefaultSpec()
  Object.assign(s.target, defaultTargetForFormat('preseed'))
  mutate?.(s)
  return s
}

const fields = (s: InstallSpec): string[] => validatePreseed(s).map((d) => d.field)

describe('validatePreseed', () => {
  it('flags a default spec with no login method (locked root, no key/password)', () => {
    // the SSH-key-first default has empty user.sshKeys → the system would be unreachable
    expect(fields(debian())).toContain('identity.primaryUser.sshKeys')
  })

  it('is satisfied once an SSH key gives a login path', () => {
    const s = debian((d) => {
      d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAA user@host']
    })
    expect(fields(s)).not.toContain('identity.primaryUser.sshKeys')
  })

  it('errors on static interface without an IP', () => {
    const s = debian((d) => {
      d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAA user@host']
      d.network.interfaces = [
        { device: 'ens3', mode: 'static', ip: '', prefix: 24, gateway: '', nameservers: [] },
      ]
    })
    expect(fields(s)).toContain('network.interfaces.0.ip')
  })

  it('errors on password root policy with no hash, and on encryption with no passphrase', () => {
    const s = debian((d) => {
      d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAA user@host']
      d.identity.rootPolicy = 'password'
      d.storage.encryption = { enabled: true, passphrase: '' }
    })
    const f = fields(s)
    expect(f).toContain('identity.rootPasswordCrypt')
    expect(f).toContain('storage.encryption.passphrase')
  })

  it('rootPolicy=sshkey with no root keys is NOT a login method (still unreachable)', () => {
    // the policy toggle alone doesn't make root reachable — there must be keys
    const s = debian((d) => {
      d.identity.rootPolicy = 'sshkey'
      d.identity.rootSshKeys = []
      d.identity.primaryUser.sshKeys = []
    })
    expect(fields(s)).toContain('identity.primaryUser.sshKeys')
  })

  it('rootPolicy=sshkey WITH root keys gives a login path', () => {
    const s = debian((d) => {
      d.identity.rootPolicy = 'sshkey'
      d.identity.rootSshKeys = ['ssh-ed25519 AAAA root@host']
      d.identity.primaryUser.sshKeys = []
    })
    expect(fields(s)).not.toContain('identity.primaryUser.sshKeys')
  })

  it('allowing SSH password auth alone (no password set) is not a login method', () => {
    const s = debian((d) => {
      d.identity.primaryUser.sshKeys = []
      d.security.sshHardening.passwordAuth = true
    })
    expect(fields(s)).toContain('identity.primaryUser.sshKeys')
  })
})
