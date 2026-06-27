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
})
