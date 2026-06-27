import { defaultTargetForFormat, freshDefaultSpec, type InstallSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { identityLines, networkLines, packagesLines, storageLines } from './sections'

// Helper: fresh Debian spec ready for preseed, with optional mutations.
const makeSpec = (mutate?: (s: InstallSpec) => void): InstallSpec => {
  const s = freshDefaultSpec()
  Object.assign(s.target, defaultTargetForFormat('preseed'))
  mutate?.(s)
  return s
}

// ── network ──────────────────────────────────────────────────────────────────

describe('networkLines', () => {
  it('DHCP default emits choose_interface select auto and hostname', () => {
    const lines = networkLines(makeSpec())
    expect(lines).toContain('d-i netcfg/choose_interface select auto')
    expect(lines.some((l) => l.includes('netcfg/get_hostname string'))).toBe(true)
  })

  it('splits hostname.domain into separate hostname and domain lines', () => {
    const lines = networkLines(makeSpec((s) => (s.network.hostname = 'web01.example.com')))
    expect(lines).toContain('d-i netcfg/get_hostname string web01')
    expect(lines).toContain('d-i netcfg/get_domain string example.com')
  })

  it('bare hostname emits no domain line', () => {
    const lines = networkLines(makeSpec((s) => (s.network.hostname = 'myhost')))
    expect(lines).toContain('d-i netcfg/get_hostname string myhost')
    expect(lines.some((l) => l.includes('get_domain'))).toBe(false)
  })

  it('static interface emits ipaddress, netmask (prefix 24 → 255.255.255.0)', () => {
    const lines = networkLines(
      makeSpec((s) => {
        s.network.interfaces = [
          {
            device: 'eth0',
            mode: 'static',
            ip: '10.0.0.10',
            prefix: 24,
            gateway: '',
            nameservers: [],
          },
        ]
      }),
    )
    expect(lines).toContain('d-i netcfg/get_ipaddress string 10.0.0.10')
    expect(lines).toContain('d-i netcfg/get_netmask string 255.255.255.0')
    expect(lines).toContain('d-i netcfg/disable_autoconfig boolean true')
    expect(lines).toContain('d-i netcfg/confirm_static boolean true')
  })

  it('static interface with nameservers uses SPACE separator, not comma', () => {
    const lines = networkLines(
      makeSpec((s) => {
        s.network.interfaces = [
          {
            device: 'eth0',
            mode: 'static',
            ip: '10.0.0.10',
            prefix: 24,
            gateway: '10.0.0.1',
            nameservers: ['10.0.0.2', '1.1.1.1'],
          },
        ]
      }),
    )
    expect(lines).toContain('d-i netcfg/get_nameservers string 10.0.0.2 1.1.1.1')
    expect(lines.some((l) => l.includes('10.0.0.2,1.1.1.1'))).toBe(false)
  })

  it('non-link device uses device name as choose_interface value', () => {
    const lines = networkLines(
      makeSpec((s) => {
        s.network.interfaces = [
          { device: 'ens3', mode: 'dhcp', ip: '', prefix: 24, gateway: '', nameservers: [] },
        ]
      }),
    )
    expect(lines).toContain('d-i netcfg/choose_interface select ens3')
  })
})

// ── identity ─────────────────────────────────────────────────────────────────

describe('identityLines', () => {
  it('locked → root-login boolean false', () => {
    const lines = identityLines(makeSpec((s) => (s.identity.rootPolicy = 'locked')))
    expect(lines).toContain('d-i passwd/root-login boolean false')
    expect(lines.some((l) => l.includes('root-password-crypted'))).toBe(false)
  })

  it('password → root-login true and root-password-crypted', () => {
    const lines = identityLines(
      makeSpec((s) => {
        s.identity.rootPolicy = 'password'
        s.identity.rootPasswordCrypt = '$6$hash'
      }),
    )
    expect(lines).toContain('d-i passwd/root-login boolean true')
    expect(lines).toContain('d-i passwd/root-password-crypted password $6$hash')
  })

  it('sshkey → root-login true and root-password-crypted !', () => {
    const lines = identityLines(makeSpec((s) => (s.identity.rootPolicy = 'sshkey')))
    expect(lines).toContain('d-i passwd/root-login boolean true')
    expect(lines).toContain('d-i passwd/root-password-crypted password !')
  })

  it('emits make-user and username', () => {
    const lines = identityLines(makeSpec())
    expect(lines).toContain('d-i passwd/make-user boolean true')
    expect(lines.some((l) => l.includes('passwd/username string'))).toBe(true)
  })

  it('user with sudo → user-default-groups contains sudo', () => {
    const lines = identityLines(makeSpec((s) => (s.identity.primaryUser.sudo = true)))
    const groupLine = lines.find((l) => l.includes('user-default-groups'))
    expect(groupLine).toBeDefined()
    expect(groupLine).toContain('sudo')
  })

  it('user without sudo → user-default-groups omits sudo', () => {
    const lines = identityLines(makeSpec((s) => (s.identity.primaryUser.sudo = false)))
    const groupLine = lines.find((l) => l.includes('user-default-groups'))
    expect(groupLine).toBeDefined()
    expect(groupLine).not.toContain('sudo')
  })

  it('key-only user (passwordMode none) emits no user-password-crypted', () => {
    const lines = identityLines(
      makeSpec((s) => {
        s.identity.primaryUser.passwordMode = 'none'
        s.identity.primaryUser.passwordCrypt = ''
      }),
    )
    expect(lines.some((l) => l.includes('user-password-crypted'))).toBe(false)
  })

  it('hashed password emits user-password-crypted', () => {
    const lines = identityLines(
      makeSpec((s) => {
        s.identity.primaryUser.passwordMode = 'hashed'
        s.identity.primaryUser.passwordCrypt = '$6$userhash'
      }),
    )
    expect(lines).toContain('d-i passwd/user-password-crypted password $6$userhash')
  })

  it('gecos line emitted when non-empty, omitted when empty', () => {
    const withGecos = identityLines(makeSpec((s) => (s.identity.primaryUser.gecos = 'Admin User')))
    expect(withGecos).toContain('d-i passwd/user-fullname string Admin User')

    const withoutGecos = identityLines(makeSpec((s) => (s.identity.primaryUser.gecos = '')))
    expect(withoutGecos.some((l) => l.includes('user-fullname'))).toBe(false)
  })
})

// ── storage ───────────────────────────────────────────────────────────────────

describe('storageLines', () => {
  it('manual scheme returns empty array', () => {
    expect(storageLines(makeSpec((s) => (s.storage.scheme = 'manual')))).toEqual([])
  })

  it('default autopart-lvm → method lvm', () => {
    const lines = storageLines(makeSpec())
    expect(lines).toContain('d-i partman-auto/method string lvm')
  })

  it('autopart-plain → method regular', () => {
    const lines = storageLines(makeSpec((s) => (s.storage.scheme = 'autopart-plain')))
    expect(lines).toContain('d-i partman-auto/method string regular')
  })

  it('direct scheme → method regular', () => {
    const lines = storageLines(makeSpec((s) => (s.storage.scheme = 'direct')))
    expect(lines).toContain('d-i partman-auto/method string regular')
  })

  it('includes early_command and atomic recipe', () => {
    const lines = storageLines(makeSpec())
    expect(lines.some((l) => l.includes('partman/early_command'))).toBe(true)
    expect(lines).toContain('d-i partman-auto/choose_recipe select atomic')
  })

  it('includes the full confirm boilerplate', () => {
    const lines = storageLines(makeSpec())
    expect(lines).toContain('d-i partman-lvm/device_remove_lvm boolean true')
    expect(lines).toContain('d-i partman-md/device_remove_md boolean true')
    expect(lines).toContain('d-i partman-lvm/confirm boolean true')
    expect(lines).toContain('d-i partman-lvm/confirm_nooverwrite boolean true')
    expect(lines).toContain('d-i partman-partitioning/confirm_write_new_label boolean true')
    expect(lines).toContain('d-i partman/choose_partition select finish')
    expect(lines).toContain('d-i partman/confirm boolean true')
    expect(lines).toContain('d-i partman/confirm_nooverwrite boolean true')
  })

  it('uefi firmware → gpt label', () => {
    const lines = storageLines(makeSpec((s) => (s.target.firmware = 'uefi')))
    expect(lines).toContain('d-i partman-partitioning/choose_label select gpt')
  })

  it('bios firmware → msdos label', () => {
    const lines = storageLines(makeSpec((s) => (s.target.firmware = 'bios')))
    expect(lines).toContain('d-i partman-partitioning/choose_label select msdos')
  })

  it('encryption → method crypto and passphrase lines', () => {
    const lines = storageLines(
      makeSpec((s) => {
        s.storage.encryption = { enabled: true, passphrase: 'secret123' }
      }),
    )
    expect(lines).toContain('d-i partman-auto/method string crypto')
    expect(lines).toContain('d-i partman-crypto/passphrase password secret123')
    expect(lines).toContain('d-i partman-crypto/passphrase-again password secret123')
    expect(lines).toContain('d-i partman-crypto/confirm boolean true')
    expect(lines).toContain('d-i partman-crypto/confirm_nooverwrite boolean true')
  })
})

// ── packages ──────────────────────────────────────────────────────────────────

describe('packagesLines', () => {
  it('default → pkgsel/include is space-joined and contains openssh-server and sudo', () => {
    const lines = packagesLines(
      makeSpec((s) => {
        s.packages.individual = ['openssh-server']
        s.identity.primaryUser.sudo = true
      }),
    )
    const inc = lines.find((l) => l.includes('pkgsel/include'))
    expect(inc).toBeDefined()
    expect(inc).toContain('openssh-server')
    expect(inc).toContain('sudo')
    // space-separated, not comma
    expect(inc).not.toContain(',')
  })

  it('sudo not duplicated when already in individual', () => {
    const lines = packagesLines(
      makeSpec((s) => {
        s.packages.individual = ['sudo', 'curl']
        s.identity.primaryUser.sudo = true
      }),
    )
    const inc = lines.find((l) => l.includes('pkgsel/include')) ?? ''
    const pkgs = inc.replace('d-i pkgsel/include string ', '').split(' ')
    expect(pkgs.filter((p) => p === 'sudo')).toHaveLength(1)
  })

  it('no packages → pkgsel/include line omitted', () => {
    const lines = packagesLines(
      makeSpec((s) => {
        s.packages.individual = []
        s.identity.primaryUser.sudo = false
      }),
    )
    expect(lines.some((l) => l.includes('pkgsel/include'))).toBe(false)
  })

  it('empty aptMirror → deb.debian.org and /debian', () => {
    const lines = packagesLines(makeSpec((s) => (s.packages.aptMirror = '')))
    expect(lines).toContain('d-i mirror/http/hostname string deb.debian.org')
    expect(lines).toContain('d-i mirror/http/directory string /debian')
  })

  it('custom aptMirror URL → correct hostname and directory', () => {
    const lines = packagesLines(
      makeSpec((s) => (s.packages.aptMirror = 'http://mirror.example.com/debian-local')),
    )
    expect(lines).toContain('d-i mirror/http/hostname string mirror.example.com')
    expect(lines).toContain('d-i mirror/http/directory string /debian-local')
    expect(lines).toContain('d-i mirror/country string manual')
  })

  it('invalid aptMirror URL falls back to deb.debian.org', () => {
    const lines = packagesLines(makeSpec((s) => (s.packages.aptMirror = 'not-a-url')))
    expect(lines).toContain('d-i mirror/http/hostname string deb.debian.org')
  })

  it('always emits pkgsel/upgrade none and tasksel standard', () => {
    const lines = packagesLines(makeSpec())
    expect(lines).toContain('d-i pkgsel/upgrade select none')
    expect(lines).toContain('tasksel tasksel/first multiselect standard')
  })
})
