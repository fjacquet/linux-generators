import { freshDefaultSpec, type InstallSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { emitAutoinstall } from './emitAutoinstall'

const ubuntuSpec = (mutate: (d: InstallSpec) => void): InstallSpec => {
  const s = freshDefaultSpec()
  Object.assign(s.target, { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' })
  s.packages.groups = []
  mutate(s)
  return s
}

describe('emitAutoinstall variants', () => {
  it('embeds a hashed user password in identity', () => {
    const s = ubuntuSpec((d) => {
      d.identity.primaryUser.passwordMode = 'hashed'
      d.identity.primaryUser.passwordCrypt = '$6$abc$def'
    })
    expect(emitAutoinstall(s).files[0]?.content).toContain('password: $6$abc$def')
  })

  it('emits an apt mirror and early-commands', () => {
    const s = ubuntuSpec((d) => {
      d.packages.aptMirror = 'http://mirror.example/ubuntu'
      d.scripts.earlyCommands = ['echo hi']
    })
    const out = emitAutoinstall(s).files[0]?.content ?? ''
    expect(out).toContain('uri: http://mirror.example/ubuntu')
    expect(out).toContain('early-commands:')
  })

  it('embeds a valid raw user-data override', () => {
    const s = ubuntuSpec((d) => {
      d.scripts.rawAutoinstallUserData = 'runcmd:\n  - echo done'
    })
    const out = emitAutoinstall(s).files[0]?.content ?? ''
    expect(out).toContain('user-data:')
    expect(out).toContain('runcmd:')
  })

  it('flags invalid raw user-data and omits it', () => {
    const s = ubuntuSpec((d) => {
      d.scripts.rawAutoinstallUserData = 'runcmd: [unterminated'
    })
    const { diagnostics } = emitAutoinstall(s)
    expect(diagnostics.some((x) => x.field === 'scripts.rawAutoinstallUserData')).toBe(true)
  })

  it('warns about kickstart url/repo and root password policy', () => {
    const s = ubuntuSpec((d) => {
      d.packages.installUrl = 'https://mirror.example/os'
      d.identity.rootPolicy = 'password'
    })
    const fields = emitAutoinstall(s).diagnostics.map((x) => x.field)
    expect(fields).toContain('packages.repos')
    expect(fields).toContain('identity.rootPolicy')
  })

  it('omits the firewall warning when the firewall is disabled', () => {
    const s = ubuntuSpec((d) => {
      d.security.firewall.enabled = false
    })
    const fields = emitAutoinstall(s).diagnostics.map((x) => x.field)
    expect(fields).not.toContain('security.firewall')
  })

  it('emits a static interface with no gateway or nameservers', () => {
    const s = ubuntuSpec((d) => {
      d.network.interfaces = [
        {
          device: 'ens3',
          mode: 'static',
          ip: '10.0.0.5',
          prefix: 24,
          gateway: '',
          nameservers: [],
        },
      ]
    })
    const out = emitAutoinstall(s).files[0]?.content ?? ''
    expect(out).toContain('- 10.0.0.5/24')
    expect(out).not.toContain('to: default')
    expect(out).not.toContain('nameservers:')
  })
})
