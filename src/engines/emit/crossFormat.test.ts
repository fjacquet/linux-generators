import { freshDefaultSpec, type InstallSpec, type TargetFormat } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { crossFormatDrops } from './crossFormat'

const spec = (mutate?: (d: InstallSpec) => void): InstallSpec => {
  const s = freshDefaultSpec()
  mutate?.(s)
  return s
}

const fields = (s: InstallSpec, format: TargetFormat): string[] =>
  crossFormatDrops(s, format).map((d) => d.field)

describe('crossFormatDrops', () => {
  it('returns nothing for a default spec on either target (warn-on-intent)', () => {
    // A brand-new/untouched spec carries no intent the target can't express, so
    // the DiagnosticsList is not pre-populated with cross-format noise.
    expect(crossFormatDrops(spec(), 'kickstart')).toEqual([])
    expect(crossFormatDrops(spec(), 'autoinstall')).toEqual([])
  })

  describe('autoinstall (Ubuntu)', () => {
    it('warns on permissive SELinux, but not on enforcing or disabled', () => {
      const permissive = spec((d) => {
        d.security.selinux = 'permissive'
      })
      expect(fields(permissive, 'autoinstall')).toContain('security.selinux')

      // 'disabled' is intent met by a target that lacks SELinux → silent
      const disabled = spec((d) => {
        d.security.selinux = 'disabled'
      })
      expect(fields(disabled, 'autoinstall')).not.toContain('security.selinux')

      // 'enforcing' is the default → silent
      expect(fields(spec(), 'autoinstall')).not.toContain('security.selinux')
    })

    it('warns on a customized active firewall, not the default or a disabled one', () => {
      const custom = spec((d) => {
        d.security.firewall.services = ['ssh', 'http']
      })
      expect(fields(custom, 'autoinstall')).toContain('security.firewall')

      // a disabled firewall is intent met even with custom services → silent
      const off = spec((d) => {
        d.security.firewall.enabled = false
        d.security.firewall.services = ['ssh', 'http']
      })
      expect(fields(off, 'autoinstall')).not.toContain('security.firewall')

      // default ssh-only ruleset → silent
      expect(fields(spec(), 'autoinstall')).not.toContain('security.firewall')
    })

    it('compares firewall services order-insensitively', () => {
      // same multiset in different order → identical verdict (never compare via join)
      const a = spec((d) => {
        d.security.firewall.services = ['ssh', 'http']
      })
      const b = spec((d) => {
        d.security.firewall.services = ['http', 'ssh']
      })
      expect(fields(a, 'autoinstall')).toEqual(fields(b, 'autoinstall'))
    })

    it('warns on non-default groups, but not on empty or default groups', () => {
      const custom = spec((d) => {
        d.packages.groups = ['@core']
      })
      expect(fields(custom, 'autoinstall')).toContain('packages.groups')

      // empty groups drop nothing on Ubuntu → silent
      const empty = spec((d) => {
        d.packages.groups = []
      })
      expect(fields(empty, 'autoinstall')).not.toContain('packages.groups')

      // the default group carried over (not cleared) → silent; exercises sameSet's
      // equality path (a literal reorder isn't constructible — the default is single-element)
      expect(fields(spec(), 'autoinstall')).not.toContain('packages.groups')
    })

    it('warns on kickstart url / repo entries', () => {
      const url = spec((d) => {
        d.packages.installUrl = 'https://mirror.example/os'
      })
      // an installUrl-only spec anchors the drop on installUrl, not repos
      expect(fields(url, 'autoinstall')).toContain('packages.installUrl')

      const repo = spec((d) => {
        d.packages.repos = [{ name: 'extras', baseurl: 'https://mirror.example/extras' }]
      })
      expect(fields(repo, 'autoinstall')).toContain('packages.repos')
    })

    it('warns when the root policy is a password (engine limitation, not a hard format limit)', () => {
      const pw = spec((d) => {
        d.identity.rootPolicy = 'password'
      })
      expect(fields(pw, 'autoinstall')).toContain('identity.rootPolicy')
    })
  })

  describe('kickstart (RHEL)', () => {
    it('warns on complain AppArmor, but not on enforce or disabled', () => {
      const complain = spec((d) => {
        d.security.apparmor = 'complain'
      })
      expect(fields(complain, 'kickstart')).toContain('security.apparmor')

      // 'disabled' is intent met by a target that lacks AppArmor → silent
      const disabled = spec((d) => {
        d.security.apparmor = 'disabled'
      })
      expect(fields(disabled, 'kickstart')).not.toContain('security.apparmor')

      // 'enforce' is the default → silent
      expect(fields(spec(), 'kickstart')).not.toContain('security.apparmor')
    })

    it('never surfaces Ubuntu-only drops on a kickstart target', () => {
      // SELinux / firewall / groups / root password are native to Kickstart, so a
      // spec full of those values produces no cross-format drop on this target.
      const s = spec((d) => {
        d.security.selinux = 'permissive'
        d.security.firewall.services = ['ssh', 'http']
        d.packages.groups = ['@core']
        d.identity.rootPolicy = 'password'
      })
      expect(crossFormatDrops(s, 'kickstart')).toEqual([])
    })
  })

  describe('preseed (Debian)', () => {
    it('returns nothing for a default Debian spec', () => {
      expect(crossFormatDrops(spec(), 'preseed')).toEqual([])
    })

    it('warns on the same RHEL-only fields as autoinstall (selinux / groups / repos)', () => {
      const selinux = spec((d) => {
        d.security.selinux = 'permissive'
      })
      expect(fields(selinux, 'preseed')).toContain('security.selinux')

      const groups = spec((d) => {
        d.packages.groups = ['@core']
      })
      expect(fields(groups, 'preseed')).toContain('packages.groups')

      const url = spec((d) => {
        d.packages.installUrl = 'https://mirror.example/os'
      })
      expect(fields(url, 'preseed')).toContain('packages.installUrl')
    })

    it('addresses the diagnostic to Debian, not Ubuntu', () => {
      const s = spec((d) => {
        d.security.selinux = 'permissive'
      })
      expect(crossFormatDrops(s, 'preseed')[0]?.message).toContain('Debian')
    })

    it('does NOT drop firewall, AppArmor, or root password (preseed emits all three)', () => {
      const s = spec((d) => {
        d.security.firewall.services = ['ssh', 'http'] // emitted via ufw late_command
        d.security.apparmor = 'complain' // emitted via aa-* late_command
        d.identity.rootPolicy = 'password' // native passwd/root-password-crypted
      })
      const f = fields(s, 'preseed')
      expect(f).not.toContain('security.firewall')
      expect(f).not.toContain('security.apparmor')
      expect(f).not.toContain('identity.rootPolicy')
    })
  })
})
