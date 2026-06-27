// src/engines/import/kickstart/parseKickstart.test.ts
import { describe, expect, it } from 'vitest'
import { emitKickstart } from '../../emit/kickstart/emitKickstart'
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
})
