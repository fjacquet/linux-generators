// src/engines/import/kickstart/parseKickstart.test.ts
import { describe, expect, it } from 'vitest'
import { emitKickstart } from '../../emit/kickstart/emitKickstart'
import { SLOT_DEFAULTS } from '../../emit/kickstart/sections'
import { freshDefaultSpec } from '../../model'
import { roundTrip } from '../roundTrip'
import { parseKickstart } from './parseKickstart'

const KS = `# sample
text
lang en_US.UTF-8
keyboard us
timezone Europe/Zurich --utc
network --bootproto=static --ip=10.0.0.5 --netmask=255.255.255.0 --device=eth0
rootpw --lock
selinux --enforcing
autopart --type=lvm
clearpart --all --initlabel
zerombr
%packages
@^minimal-environment
vim
-nano
%end
%post --log=/root/post.log
echo hi
%end
`

describe('parseKickstart', () => {
  it('maps known directives into the spec', () => {
    const { spec } = parseKickstart(KS)
    expect(spec.target.osFamily).toBe('rhel')
    expect(spec.locale.language).toBe('en_US.UTF-8')
    expect(spec.locale.timezone).toBe('Europe/Zurich')
    expect(spec.network.interfaces[0]).toMatchObject({
      mode: 'static',
      ip: '10.0.0.5',
      prefix: 24,
      device: 'eth0',
    })
    expect(spec.identity.rootPolicy).toBe('locked')
    expect(spec.security.selinux).toBe('enforcing')
    expect(spec.storage.scheme).toBe('autopart-lvm')
    expect(spec.packages.groups).toContain('@^minimal-environment')
    expect(spec.packages.individual).toContain('vim')
  })

  it('routes an unknown command to extraCommands', () => {
    const { spec } = parseKickstart(KS)
    expect(spec.passthrough.kickstart.extraCommands).toContain('zerombr')
  })

  it('captures the %post body verbatim', () => {
    const { spec } = parseKickstart(KS)
    expect(spec.scripts.rawKickstartPost).toContain('echo hi')
  })

  it('applies the all-or-nothing storage rule for volgroup/logvol layouts', () => {
    const ks = `clearpart --all\npart /boot --fstype=xfs --size=1024\nvolgroup vg00 pv.01\nlogvol / --vgname=vg00 --size=8192 --name=root\n`
    const { spec } = parseKickstart(ks)
    expect(spec.storage.scheme).toBe('manual')
    expect(spec.storage.partitions).toEqual([])
    expect(spec.passthrough.kickstart.rawStorage).toEqual([
      'clearpart --all',
      'part /boot --fstype=xfs --size=1024',
      'volgroup vg00 pv.01',
      'logvol / --vgname=vg00 --size=8192 --name=root',
    ])
  })

  it('records an unknown flag on a known command with its occurrence index', () => {
    const ks = 'network --device=eth0\nnetwork --device=eth1 --bindto=mac\n'
    const { spec } = parseKickstart(ks)
    expect(spec.passthrough.kickstart.unknownFlags).toContainEqual({
      command: 'network',
      index: 1,
      flags: ['--bindto=mac'],
    })
  })

  it('soft-fails a bad value: keeps default + warns, does not throw', () => {
    const { spec, diagnostics } = parseKickstart('selinux --bogus-mode\n')
    expect(spec.security.selinux).toBe('enforcing') // default kept
    expect(
      diagnostics.some((d) => d.severity === 'warning' && d.field === 'security.selinux'),
    ).toBe(true)
  })

  it('captures autopart with an unknown flag into rawStorage and does not override scheme', () => {
    const ks = 'autopart --type=lvm --pool=fast\nclearpart --all\n'
    const { spec } = parseKickstart(ks)
    expect(spec.storage.scheme).toBe('manual')
    expect(spec.storage.partitions).toEqual([])
    expect(spec.passthrough.kickstart.rawStorage).toEqual([
      'autopart --type=lvm --pool=fast',
      'clearpart --all',
    ])
  })

  it('maps --service flags into spec.security.firewall.services (not unknownFlags)', () => {
    const { spec } = parseKickstart('firewall --enabled --service=ssh --service=http\n')
    expect(spec.security.firewall.services).toEqual(['ssh', 'http'])
    expect(spec.passthrough.kickstart.unknownFlags.some((e) => e.command === 'firewall')).toBe(
      false,
    )
  })

  it('records an unknown flag on rootpw while still mapping the known flag', () => {
    const { spec } = parseKickstart('rootpw --lock --minlen=8\n')
    expect(spec.identity.rootPolicy).toBe('locked')
    expect(spec.passthrough.kickstart.unknownFlags).toContainEqual({
      command: 'rootpw',
      index: 0,
      flags: ['--minlen=8'],
    })
  })

  it('preserves an unsupported rootpw mode verbatim instead of dropping the password', () => {
    const { spec } = parseKickstart('rootpw --plaintext root\n')
    // The positional password must NOT be silently lost: the whole line is kept verbatim.
    expect(spec.passthrough.kickstart.extraCommands).toContain('rootpw --plaintext root')
  })

  it('reads network --prefix directly (does not keep default 24 or record it as unknown)', () => {
    const { spec } = parseKickstart(
      'network --bootproto=static --ip=10.0.0.5 --prefix=16 --device=eth0\n',
    )
    expect(spec.network.interfaces[0]?.prefix).toBe(16)
    expect(spec.passthrough.kickstart.unknownFlags).toHaveLength(0)
  })

  it('does not record --initlabel into unknownFlags for clearpart', () => {
    const { spec } = parseKickstart('clearpart --all --initlabel\n')
    expect(spec.passthrough.kickstart.unknownFlags.some((e) => e.command === 'clearpart')).toBe(
      false,
    )
  })

  it('round-trips a default-spec kickstart without loss', () => {
    const original = emitKickstart(freshDefaultSpec()).files[0]?.content ?? ''
    const { spec } = parseKickstart(original)
    expect(roundTrip(original, spec, 'kickstart').fidelity).not.toBe('lossy')
  })

  it('idempotent: import(emit(import(emit(default-spec)))) is a fixed point', () => {
    const original = emitKickstart(freshDefaultSpec()).files[0]?.content ?? ''
    const s1 = parseKickstart(original).spec
    const s2 = parseKickstart(emitKickstart(s1).files[0]?.content ?? '').spec
    expect(s2).toEqual(s1)
  })

  it('maps user directive into primaryUser fields', () => {
    const ks = 'user --name=admin --groups=wheel,kvm --iscrypted --password=$6$x\n'
    const { spec } = parseKickstart(ks)
    expect(spec.identity.primaryUser.name).toBe('admin')
    expect(spec.identity.primaryUser.groups).toEqual(['wheel', 'kvm'])
    expect(spec.identity.primaryUser.passwordMode).toBe('hashed')
    expect(spec.identity.primaryUser.passwordCrypt).toBe('$6$x')
    expect(spec.passthrough.kickstart.extraCommands.some((c) => c.startsWith('user'))).toBe(false)
  })

  it('maps sshkey --username=root into rootSshKeys and sets rootPolicy=sshkey', () => {
    const ks = 'sshkey --username=root "ssh-ed25519 AAA"\n'
    const { spec } = parseKickstart(ks)
    expect(spec.identity.rootSshKeys).toContain('ssh-ed25519 AAA')
    expect(spec.identity.rootPolicy).toBe('sshkey')
    expect(spec.passthrough.kickstart.extraCommands.some((c) => c.startsWith('sshkey'))).toBe(false)
  })

  it('maps sshkey for non-root username into primaryUser.sshKeys', () => {
    const ks = 'sshkey --username=admin "ssh-ed25519 BBB"\n'
    const { spec } = parseKickstart(ks)
    expect(spec.identity.primaryUser.sshKeys).toContain('ssh-ed25519 BBB')
  })

  it('strips %post hardening lines and preserves remaining content', () => {
    const ks = `%post
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
echo hi
%end
`
    const { spec } = parseKickstart(ks)
    expect(spec.security.sshHardening.permitRootLogin).toBe(true)
    expect(spec.security.sshHardening.passwordAuth).toBe(false)
    expect(spec.scripts.rawKickstartPost).toBe('echo hi')
  })

  it('preserves leading indentation in the remaining %post body (no trim)', () => {
    const ks = '%post\n  if true; then\n    echo nested\n  fi\n%end\n'
    const { spec } = parseKickstart(ks)
    expect(spec.scripts.rawKickstartPost).toBe('  if true; then\n    echo nested\n  fi')
  })

  it('rootPolicy=sshkey round-trip: root key is not lost on re-emit', () => {
    const spec = freshDefaultSpec()
    spec.identity.rootPolicy = 'sshkey'
    spec.identity.rootSshKeys = ['ssh-ed25519 AAAATESTKEY user@host']
    const original = emitKickstart(spec).files[0]?.content ?? ''
    const s1 = parseKickstart(original).spec
    expect(s1.identity.rootPolicy).toBe('sshkey')
    expect(s1.identity.rootSshKeys).toContain('ssh-ed25519 AAAATESTKEY user@host')
    const s2 = parseKickstart(emitKickstart(s1).files[0]?.content ?? '').spec
    expect(s2).toEqual(s1)
  })

  it('garbage netmask 1023.1023.1023.1023 falls back to prefix 24 and emits a warning (does not reject)', () => {
    const ks =
      'network --bootproto=static --ip=10.0.0.5 --netmask=1023.1023.1023.1023 --device=eth0\n'
    const { spec, diagnostics } = parseKickstart(ks)
    expect(spec.network.interfaces[0]?.prefix).toBe(24)
    expect(
      diagnostics.some((d) => d.severity === 'warning' && d.field === 'network.interfaces'),
    ).toBe(true)
  })

  it('does not route bootloader or services into extraCommands', () => {
    const ks = 'bootloader --location=mbr\nservices --enabled=sshd,chronyd\n'
    const { spec } = parseKickstart(ks)
    expect(spec.passthrough.kickstart.extraCommands.some((c) => c.startsWith('bootloader'))).toBe(
      false,
    )
    expect(spec.passthrough.kickstart.extraCommands.some((c) => c.startsWith('services'))).toBe(
      false,
    )
  })

  // --- round-trip fidelity: constant-command / section-header / keyboard / autopart ---

  it('bootloader with extra flags: constantLines captured, re-emit contains --append flag', () => {
    const ks = 'bootloader --location=mbr --append="quiet"\n'
    const { spec } = parseKickstart(ks)
    expect(spec.passthrough.kickstart.constantLines.bootloader).toBe(
      'bootloader --location=mbr --append="quiet"',
    )
    const reEmit = emitKickstart(spec).files[0]?.content ?? ''
    expect(reEmit).toContain('--append="quiet"')
    // idempotence
    const s2 = parseKickstart(reEmit).spec
    expect(s2.passthrough.kickstart.constantLines.bootloader).toBe(
      spec.passthrough.kickstart.constantLines.bootloader,
    )
  })

  it('services with extra flags: re-emit preserves --disabled flag', () => {
    const ks = 'services --enabled=sshd --disabled=kdump\n'
    const { spec } = parseKickstart(ks)
    const reEmit = emitKickstart(spec).files[0]?.content ?? ''
    expect(reEmit).toContain('--disabled=kdump')
    const s2 = parseKickstart(reEmit).spec
    expect(s2.passthrough.kickstart.constantLines.services).toBe(
      spec.passthrough.kickstart.constantLines.services,
    )
  })

  it('%packages --ignoremissing: re-emit preserves header flag', () => {
    const ks = '%packages --ignoremissing\n@core\n%end\n'
    const { spec } = parseKickstart(ks)
    expect(spec.passthrough.kickstart.packagesHeader).toBe('%packages --ignoremissing')
    const reEmit = emitKickstart(spec).files[0]?.content ?? ''
    expect(reEmit).toContain('%packages --ignoremissing')
    const s2 = parseKickstart(reEmit).spec
    expect(s2.passthrough.kickstart.packagesHeader).toBe(spec.passthrough.kickstart.packagesHeader)
  })

  it('%post with custom log path: re-emit preserves header', () => {
    const ks = '%post --log=/root/post.log\necho hi\n%end\n'
    const { spec } = parseKickstart(ks)
    expect(spec.passthrough.kickstart.postHeader).toBe('%post --log=/root/post.log')
    const reEmit = emitKickstart(spec).files[0]?.content ?? ''
    expect(reEmit).toContain('%post --log=/root/post.log')
    const s2 = parseKickstart(reEmit).spec
    expect(s2.passthrough.kickstart.postHeader).toBe(spec.passthrough.kickstart.postHeader)
  })

  it('keyboard --xlayouts flag: re-emit keyboard line contains --xlayouts', () => {
    const ks = "keyboard --vckeymap=us --xlayouts='fr'\n"
    const { spec } = parseKickstart(ks)
    const reEmit = emitKickstart(spec).files[0]?.content ?? ''
    expect(reEmit).toMatch(/keyboard --vckeymap=us .*--xlayouts='fr'/)
    // idempotence
    const s2 = parseKickstart(reEmit).spec
    expect(s2.passthrough.kickstart.unknownFlags).toEqual(spec.passthrough.kickstart.unknownFlags)
  })

  // --- idempotence regression tests ---

  it('minimal KS (no services/firstboot/reboot/bootloader) has empty constantLines and is idempotent', () => {
    const ks = 'text\nlang en_US.UTF-8\nrootpw --lock\n'
    const { spec: spec1 } = parseKickstart(ks)
    expect(spec1.passthrough.kickstart.constantLines).toEqual({})
    const reEmit = emitKickstart(spec1).files[0]?.content ?? ''
    const { spec: spec2 } = parseKickstart(reEmit)
    expect(spec2).toEqual(spec1)
  })

  it('constant matching its default is NOT captured into constantLines', () => {
    const ks = `${SLOT_DEFAULTS.services}\n`
    const { spec } = parseKickstart(ks)
    expect(spec.passthrough.kickstart.constantLines.services).toBeUndefined()
  })

  it('constant differing from its default IS captured into constantLines', () => {
    const ks = 'services --enabled=sshd,chronyd,ntpd\n'
    const { spec } = parseKickstart(ks)
    expect(spec.passthrough.kickstart.constantLines.services).toBe(
      'services --enabled=sshd,chronyd,ntpd',
    )
  })

  it('autopart --nohome: scheme stays autopart-lvm, re-emit contains --nohome', () => {
    const ks = 'autopart --type=lvm --nohome\n'
    const { spec } = parseKickstart(ks)
    expect(spec.storage.scheme).toBe('autopart-lvm')
    const reEmit = emitKickstart(spec).files[0]?.content ?? ''
    expect(reEmit).toContain('--nohome')
    // idempotence
    const s2 = parseKickstart(reEmit).spec
    expect(s2.storage.scheme).toBe('autopart-lvm')
    expect(s2.passthrough.kickstart.unknownFlags).toEqual(spec.passthrough.kickstart.unknownFlags)
  })
})
