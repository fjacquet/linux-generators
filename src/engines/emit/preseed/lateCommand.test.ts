import { defaultTargetForFormat, freshDefaultSpec, type InstallSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { buildEarlyCommand, buildLateCommand } from './lateCommand'

// Helper: fresh Debian preseed spec with optional mutations.
const makeSpec = (mutate?: (s: InstallSpec) => void): InstallSpec => {
  const s = freshDefaultSpec()
  Object.assign(s.target, defaultTargetForFormat('preseed'))
  mutate?.(s)
  return s
}

describe('buildLateCommand', () => {
  it('user SSH key → directive starts with prefix, contains mkdir and echo and chown', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.identity.primaryUser.name = 'alice'
        s.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAAC3Nz alice@host']
        // disable other sources to keep test focused
        s.security.firewall.enabled = false
        s.security.sshHardening.permitRootLogin = true
        s.security.sshHardening.passwordAuth = true
        s.security.apparmor = 'enforce'
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/^d-i preseed\/late_command string /)
    expect(out[0]).toContain('mkdir -p /target/home/alice/.ssh')
    expect(out[0]).toContain(
      'echo "ssh-ed25519 AAAAC3Nz alice@host" >> /target/home/alice/.ssh/authorized_keys',
    )
    expect(out[0]).toContain('in-target chown -R alice:alice /home/alice/.ssh')
  })

  it('rootPolicy=sshkey → root keys installed under /target/root/.ssh with no chown', () => {
    // root owns /root already, so the root recipe omits the in-target chown the user one has
    const out = buildLateCommand(
      makeSpec((s) => {
        s.identity.rootPolicy = 'sshkey'
        s.identity.rootSshKeys = ['ssh-ed25519 AAAAROOT root@host']
        s.identity.primaryUser.sshKeys = []
        s.security.firewall.enabled = false
        s.security.sshHardening.permitRootLogin = true
        s.security.sshHardening.passwordAuth = true
        s.security.apparmor = 'enforce'
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('mkdir -p /target/root/.ssh')
    expect(out[0]).toContain(
      'echo "ssh-ed25519 AAAAROOT root@host" >> /target/root/.ssh/authorized_keys',
    )
    expect(out[0]).toContain('chmod 700 /target/root/.ssh')
    expect(out[0]).toContain('chmod 600 /target/root/.ssh/authorized_keys')
    expect(out[0]).not.toContain('chown -R root:root')
  })

  it('default hardening (permitRootLogin=false, passwordAuth=false) → sed lines present', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.security.sshHardening.permitRootLogin = false
        s.security.sshHardening.passwordAuth = false
        s.security.firewall.enabled = false
        s.security.apparmor = 'enforce'
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('PermitRootLogin no')
    expect(out[0]).toContain('PasswordAuthentication no')
  })

  it('firewall enabled with services → apt-get ufw, allow lines, enable', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.security.firewall = { enabled: true, services: ['ssh', 'http'] }
        s.security.sshHardening.permitRootLogin = true
        s.security.sshHardening.passwordAuth = true
        s.security.apparmor = 'enforce'
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('apt-get install -y ufw')
    expect(out[0]).toContain('in-target ufw allow ssh')
    expect(out[0]).toContain('in-target ufw allow http')
    expect(out[0]).toContain('in-target ufw --force enable')
  })

  it('apparmor complain → aa-complain present', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.security.apparmor = 'complain'
        s.security.firewall.enabled = false
        s.security.sshHardening.permitRootLogin = true
        s.security.sshHardening.passwordAuth = true
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('aa-complain')
  })

  it('apparmor enforce (default) → no aa- fragment', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.security.apparmor = 'enforce'
        s.security.firewall.enabled = false
        s.security.sshHardening.permitRootLogin = true
        s.security.sshHardening.passwordAuth = true
      }),
    )
    // may be [] or contain other things — but must not contain aa-
    expect(out.join('')).not.toContain('aa-')
  })

  it('apparmor disabled → systemctl disable apparmor', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.security.apparmor = 'disabled'
        s.security.firewall.enabled = false
        s.security.sshHardening.permitRootLogin = true
        s.security.sshHardening.passwordAuth = true
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('systemctl disable apparmor')
  })

  it('curtin in-target prefix is rewritten to in-target', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.scripts.lateCommands = ['curtin in-target -- systemctl enable foo']
        s.security.firewall.enabled = false
        s.security.sshHardening.permitRootLogin = true
        s.security.sshHardening.passwordAuth = true
        s.security.apparmor = 'enforce'
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('in-target systemctl enable foo')
    expect(out[0]).not.toContain('curtin')
  })

  it('empty path → returns []', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.security.sshHardening.permitRootLogin = true
        s.security.sshHardening.passwordAuth = true
        s.identity.primaryUser.sshKeys = []
        s.identity.rootSshKeys = []
        s.security.firewall.enabled = false
        s.security.apparmor = 'enforce'
        s.scripts.lateCommands = []
      }),
    )
    expect(out).toEqual([])
  })

  it('fragments are ; -joined on a single line — no newline in out[0]', () => {
    const out = buildLateCommand(
      makeSpec((s) => {
        s.identity.primaryUser.sshKeys = ['ssh-rsa AAAA user@host']
        s.security.firewall = { enabled: true, services: ['ssh'] }
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).not.toContain('\n')
  })
})

describe('buildEarlyCommand', () => {
  it('emits one preseed/early_command directive, ; -joined verbatim', () => {
    // these run in the installer env (pre-chroot), so no in-target/curtin rewrite
    const out = buildEarlyCommand(
      makeSpec((s) => {
        s.scripts.earlyCommands = ['echo hi', 'wipefs -a /dev/sdb']
      }),
    )
    expect(out).toEqual(['d-i preseed/early_command string echo hi; wipefs -a /dev/sdb'])
  })

  it('returns [] when there are no early commands (no empty directive)', () => {
    expect(
      buildEarlyCommand(
        makeSpec((s) => {
          s.scripts.earlyCommands = []
        }),
      ),
    ).toEqual([])
  })
})
