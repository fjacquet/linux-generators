import { freshDefaultSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { identityLines, securityLines, storageLines } from './sections'

describe('identityLines variants', () => {
  it('emits root SSH keys when rootPolicy is sshkey', () => {
    const s = freshDefaultSpec()
    s.identity.rootPolicy = 'sshkey'
    s.identity.rootSshKeys = ['ssh-ed25519 AAAAROOT root@admin']
    const lines = identityLines(s)
    expect(lines).toContain('rootpw --lock')
    expect(lines).toContain('sshkey --username=root "ssh-ed25519 AAAAROOT root@admin"')
  })

  it('emits an iscrypted root password when one is provided', () => {
    const s = freshDefaultSpec()
    s.identity.rootPolicy = 'password'
    s.identity.rootPasswordCrypt = '$6$abc$def'
    expect(identityLines(s)[0]).toBe('rootpw --iscrypted $6$abc$def')
  })

  it('emits an iscrypted user password when the mode is hashed', () => {
    const s = freshDefaultSpec()
    s.identity.primaryUser.passwordMode = 'hashed'
    s.identity.primaryUser.passwordCrypt = '$6$xyz$uvw'
    const userLine = identityLines(s).find((l) => l.startsWith('user '))
    expect(userLine).toContain('--iscrypted --password=$6$xyz$uvw')
  })
})

describe('storageLines variants', () => {
  it('emits part lines for the manual scheme', () => {
    const s = freshDefaultSpec()
    s.storage.scheme = 'manual'
    s.storage.partitions = [
      { mountpoint: '/boot', size: '1024', fstype: 'xfs', grow: false },
      { mountpoint: '/', size: '0', fstype: 'xfs', grow: true },
    ]
    expect(storageLines(s)).toEqual([
      'clearpart --all --initlabel',
      'part /boot --fstype=xfs --size=1024',
      'part / --fstype=xfs --grow',
    ])
  })

  it('adds --noswap when swap is none', () => {
    const s = freshDefaultSpec()
    s.storage.swap = 'none'
    expect(storageLines(s)).toContain('autopart --type=lvm --noswap')
  })

  it('skips clearpart when wipe is disabled', () => {
    const s = freshDefaultSpec()
    s.storage.wipe = false
    expect(storageLines(s)).not.toContain('clearpart --all --initlabel')
  })
})

describe('securityLines variants', () => {
  it('emits firewall --disabled when the firewall is off', () => {
    const s = freshDefaultSpec()
    s.security.firewall.enabled = false
    expect(securityLines(s)).toContain('firewall --disabled')
  })
})
