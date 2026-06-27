// src/engines/import/autoinstall/parseAutoinstall.test.ts
import { describe, expect, it } from 'vitest'
import { emitAutoinstall } from '../../emit/autoinstall/emitAutoinstall'
import { freshDefaultSpec } from '../../model'
import { parseAutoinstall } from './parseAutoinstall'

const UD = `#cloud-config
autoinstall:
  version: 1
  locale: en_US.UTF-8
  keyboard:
    layout: ch
    variant: fr
  timezone: Europe/Zurich
  identity:
    hostname: web01
    username: admin
    shell: /bin/zsh
  ssh:
    install-server: true
    allow-pw: false
    authorized-keys:
      - ssh-ed25519 AAAA admin@host
  storage:
    layout:
      name: lvm
  packages:
    - vim
  snaps:
    install:
      - name: microk8s
  shutdown: reboot
`

const UD_EXTENDED = `#cloud-config
autoinstall:
  version: 1
  locale: en_US.UTF-8
  keyboard:
    layout: us
  timezone: UTC
  identity:
    hostname: web01
    username: admin
  ssh:
    install-server: false
    allow-pw: true
    authorized-keys:
      - ssh-ed25519 AAAA admin@host
  network:
    version: 2
    ethernets:
      eth0:
        addresses:
          - 10.0.0.5/24
        routes:
          - to: default
            via: 10.0.0.1
        nameservers:
          addresses:
            - 8.8.8.8
            - 8.8.4.4
  apt:
    primary:
      - arches:
          - default
        uri: http://archive.ubuntu.com/ubuntu
  storage:
    config:
      - id: disk0
        type: disk
        ptable: gpt
  user-data:
    runcmd:
      - echo hello
  shutdown: reboot
`

describe('parseAutoinstall', () => {
  it('maps known keys into the spec', () => {
    const { spec } = parseAutoinstall(UD)
    expect(spec.target.osFamily).toBe('ubuntu')
    expect(spec.locale.language).toBe('en_US.UTF-8')
    expect(spec.locale.keyboard).toBe('ch')
    expect(spec.locale.keyboardVariant).toBe('fr')
    expect(spec.network.hostname).toBe('web01')
    expect(spec.identity.primaryUser.name).toBe('admin')
    expect(spec.identity.primaryUser.sshKeys).toContain('ssh-ed25519 AAAA admin@host')
    expect(spec.storage.scheme).toBe('autopart-lvm')
    expect(spec.packages.individual).toContain('vim')
  })

  it('keeps unknown keys and unmodeled siblings in extraKeys (leaf-level)', () => {
    const { spec } = parseAutoinstall(UD)
    const extra = spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    expect(extra.snaps).toEqual({ install: [{ name: 'microk8s' }] })
    expect((extra.identity as Record<string, unknown>).shell).toBe('/bin/zsh')
    expect((extra.identity as Record<string, unknown>).username).toBeUndefined() // consumed leaf removed
  })

  it('warns on version !== 1 but still imports', () => {
    const { diagnostics } = parseAutoinstall('#cloud-config\nautoinstall:\n  version: 2\n')
    expect(diagnostics.some((d) => d.field === 'version')).toBe(true)
  })

  it('throws on malformed YAML', () => {
    expect(() => parseAutoinstall('#cloud-config\nautoinstall:\n  : : :\n')).toThrow()
  })

  it('maps network.ethernets, apt.primary, storage.config, user-data; keeps ssh.install-server in extraKeys', () => {
    const { spec } = parseAutoinstall(UD_EXTENDED)

    // network.ethernets → static interface
    expect(spec.network.interfaces).toHaveLength(1)
    const iface = spec.network.interfaces[0]
    expect(iface?.device).toBe('eth0')
    expect(iface?.mode).toBe('static')
    expect(iface?.ip).toBe('10.0.0.5')
    expect(iface?.prefix).toBe(24)
    expect(iface?.gateway).toBe('10.0.0.1')
    expect(iface?.nameservers).toContain('8.8.8.8')
    expect(iface?.nameservers).toContain('8.8.4.4')

    // apt.primary[0].uri → aptMirror
    expect(spec.packages.aptMirror).toBe('http://archive.ubuntu.com/ubuntu')

    // storage.config → manual scheme + rawAutoinstallStorage passthrough
    expect(spec.storage.scheme).toBe('manual')
    expect(spec.scripts.rawAutoinstallStorage.trim()).not.toBe('')

    // user-data → rawAutoinstallUserData passthrough
    expect(spec.scripts.rawAutoinstallUserData.trim()).not.toBe('')

    // ssh.install-server NOT consumed — survives in extraKeys
    const extra = spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    expect((extra.ssh as Record<string, unknown>)?.['install-server']).toBe(false)
  })

  it('ethernets: preserves unmodeled mtu/match in extraKeys, mapped fields round-trip', () => {
    const ud = `#cloud-config
autoinstall:
  version: 1
  network:
    version: 2
    ethernets:
      eth0:
        dhcp4: true
        mtu: 1400
        match:
          macaddress: '00:11:22:33:44:55'
`
    const { spec } = parseAutoinstall(ud)
    const extra = spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    const eth0 = (extra.network as Record<string, unknown>)?.ethernets as Record<string, unknown>
    const eth0Obj = eth0?.eth0 as Record<string, unknown>
    expect(eth0Obj?.mtu).toBe(1400)
    expect(eth0Obj?.match).toEqual({ macaddress: '00:11:22:33:44:55' })
    // dhcp4 consumed — not in extraKeys
    expect(eth0Obj?.dhcp4).toBeUndefined()
    // round-trip: emit → re-parse → same extraKeys
    const yaml2 = emitAutoinstall(spec).files[0]?.content ?? ''
    const { spec: spec2 } = parseAutoinstall(yaml2)
    const extra2 = spec2.passthrough.autoinstall.extraKeys as Record<string, unknown>
    const eth0B = (extra2.network as Record<string, unknown>)?.ethernets as Record<string, unknown>
    expect((eth0B?.eth0 as Record<string, unknown>)?.mtu).toBe(1400)
    expect((eth0B?.eth0 as Record<string, unknown>)?.match).toEqual({
      macaddress: '00:11:22:33:44:55',
    })
    expect(spec2.network.interfaces[0]?.mode).toBe('dhcp')
  })

  it('storage.layout: preserves unmodeled sizing-policy in extraKeys, scheme maps correctly', () => {
    const ud = `#cloud-config
autoinstall:
  version: 1
  storage:
    layout:
      name: lvm
      sizing-policy: all
`
    const { spec } = parseAutoinstall(ud)
    expect(spec.storage.scheme).toBe('autopart-lvm')
    const extra = spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    const layout = (extra.storage as Record<string, unknown>)?.layout as Record<string, unknown>
    expect(layout?.['sizing-policy']).toBe('all')
    // layout.name consumed — not in extraKeys
    expect(layout?.name).toBeUndefined()
    // round-trip
    const yaml2 = emitAutoinstall(spec).files[0]?.content ?? ''
    const { spec: spec2 } = parseAutoinstall(yaml2)
    const extra2 = spec2.passthrough.autoinstall.extraKeys as Record<string, unknown>
    const layout2 = (extra2.storage as Record<string, unknown>)?.layout as Record<string, unknown>
    expect(layout2?.['sizing-policy']).toBe('all')
    expect(spec2.storage.scheme).toBe('autopart-lvm')
  })

  it('apt.primary: preserves arches in extraKeys, uri maps to aptMirror', () => {
    const ud = `#cloud-config
autoinstall:
  version: 1
  apt:
    primary:
      - uri: http://my.mirror.example.com/ubuntu
        arches:
          - amd64
`
    const { spec } = parseAutoinstall(ud)
    expect(spec.packages.aptMirror).toBe('http://my.mirror.example.com/ubuntu')
    const extra = spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    const primaryArr = (extra.apt as Record<string, unknown>)?.primary as unknown[]
    expect(Array.isArray(primaryArr)).toBe(true)
    expect((primaryArr?.[0] as Record<string, unknown>)?.arches).toEqual(['amd64'])
    // uri consumed — not in extraKeys
    expect((primaryArr?.[0] as Record<string, unknown>)?.uri).toBeUndefined()
    // round-trip
    const yaml2 = emitAutoinstall(spec).files[0]?.content ?? ''
    const { spec: spec2 } = parseAutoinstall(yaml2)
    expect(spec2.packages.aptMirror).toBe('http://my.mirror.example.com/ubuntu')
    // Known edge: deepMerge array-replace makes the emitter's default arches:['default'] win.
    const extra2 = spec2.passthrough.autoinstall.extraKeys as Record<string, unknown>
    const primary2 = (extra2.apt as Record<string, unknown>)?.primary as unknown[]
    expect((primary2?.[0] as Record<string, unknown>)?.arches).toEqual(['default'])
  })

  it('shutdown: custom value poweroff round-trips; default spec still emits reboot', () => {
    const ud = `#cloud-config
autoinstall:
  version: 1
  shutdown: poweroff
`
    const { spec } = parseAutoinstall(ud)
    const extra = spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    expect(extra.shutdown).toBe('poweroff')
    // emitter uses the extraKeys value
    const yaml2 = emitAutoinstall(spec).files[0]?.content ?? ''
    expect(yaml2).toContain('shutdown: poweroff')
    expect(yaml2).not.toContain('shutdown: reboot')
    // idempotent: re-parse still has shutdown in extraKeys
    const { spec: spec2 } = parseAutoinstall(yaml2)
    const extra2 = spec2.passthrough.autoinstall.extraKeys as Record<string, unknown>
    expect(extra2.shutdown).toBe('poweroff')
    // default spec (empty extraKeys) still emits reboot
    const defaultSpec = freshDefaultSpec()
    const defaultOut = emitAutoinstall(defaultSpec).files[0]?.content ?? ''
    expect(defaultOut).toContain('shutdown: reboot')
  })

  it('out-of-range prefix /99 falls back to 24 and emits a warning (does not reject)', () => {
    const ud = `#cloud-config
autoinstall:
  version: 1
  network:
    version: 2
    ethernets:
      eth0:
        addresses:
          - 10.0.0.5/99
        gateway4: 10.0.0.1
`
    const result = parseAutoinstall(ud)
    expect(result.spec.network.interfaces).toHaveLength(1)
    expect(result.spec.network.interfaces[0]?.prefix).toBe(24)
    expect(
      result.diagnostics.some((d) => d.severity === 'warning' && d.field === 'network.ethernets'),
    ).toBe(true)
  })
})
