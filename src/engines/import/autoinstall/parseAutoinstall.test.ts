// src/engines/import/autoinstall/parseAutoinstall.test.ts
import { describe, expect, it } from 'vitest'
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
})
