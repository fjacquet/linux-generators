import { freshDefaultSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import {
  AUTOINSTALL_FIXTURES,
  encryptedUbuntu,
  minimalUbuntu,
  staticUbuntu,
} from '@/__fixtures__/ubuntuSpecs'
import { emitAutoinstall } from './emitAutoinstall'

describe('emitAutoinstall', () => {
  it.each(AUTOINSTALL_FIXTURES)('golden output: $name', ({ spec }) => {
    expect(emitAutoinstall(spec).files[0]?.content).toMatchSnapshot()
  })

  it('produces a single cloud-config user-data file', () => {
    const { files } = emitAutoinstall(minimalUbuntu)
    expect(files).toHaveLength(1)
    expect(files[0]?.filename).toBe('user-data')
    expect(files[0]?.language).toBe('yaml')
  })

  it('emits the cloud-config header, version 1 and shutdown reboot', () => {
    const out = emitAutoinstall(minimalUbuntu).files[0]?.content ?? ''
    expect(out.startsWith('#cloud-config\n')).toBe(true)
    expect(out).toContain('version: 1')
    expect(out).toContain('shutdown: reboot')
    expect(out).toContain('install-server: true')
    expect(out).toContain('allow-pw: false')
  })

  it('uses guided LVM layout by default and omits a network section', () => {
    const out = emitAutoinstall(minimalUbuntu).files[0]?.content ?? ''
    expect(out).toContain('name: lvm')
    expect(out).not.toContain('ethernets:')
  })

  it('emits a netplan ethernets block for a static interface', () => {
    const out = emitAutoinstall(staticUbuntu).files[0]?.content ?? ''
    expect(out).toContain('ethernets:')
    expect(out).toContain('ens3:')
    expect(out).toContain('- 10.0.0.10/24')
    expect(out).toContain('to: default')
    expect(out).toContain('via: 10.0.0.1')
  })

  it('passes the LUKS passphrase into the storage layout', () => {
    const out = emitAutoinstall(encryptedUbuntu).files[0]?.content ?? ''
    expect(out).toContain('password: secret')
  })

  it('stays silent on a default Ubuntu spec (warn-on-intent)', () => {
    // minimalUbuntu keeps default SELinux/firewall and empty groups → no lost
    // intent, so the DiagnosticsList is not pre-populated with cross-format noise.
    const fields = emitAutoinstall(minimalUbuntu).diagnostics.map((d) => d.field)
    expect(fields).not.toContain('security.selinux')
    expect(fields).not.toContain('security.firewall')
    expect(fields).not.toContain('packages.groups')
  })

  it('warns when SELinux and a customized firewall diverge from default on Ubuntu', () => {
    const s = freshDefaultSpec()
    Object.assign(s.target, { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' })
    // inject intent the target can't express: permissive SELinux (default 'enforcing'
    // is silent) and a non-default active ruleset (default ['ssh'] is silent)
    s.security.selinux = 'permissive'
    s.security.firewall.services = ['ssh', 'http']
    const fields = emitAutoinstall(s).diagnostics.map((d) => d.field)
    expect(fields).toContain('security.selinux')
    expect(fields).toContain('security.firewall')
  })

  it('warns when RHEL package groups are present on an Ubuntu target', () => {
    const s = freshDefaultSpec()
    Object.assign(s.target, { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' })
    s.packages.groups = ['@core'] // non-default, non-empty group set → lost intent on Ubuntu
    const { diagnostics } = emitAutoinstall(s)
    expect(diagnostics.map((d) => d.field)).toContain('packages.groups')
  })

  it('uses a raw Curtin storage override when scheme is manual', () => {
    const s = freshDefaultSpec()
    Object.assign(s.target, { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' })
    s.storage.scheme = 'manual'
    s.scripts.rawAutoinstallStorage = 'config:\n  - type: disk\n    id: disk0'
    const out = emitAutoinstall(s).files[0]?.content ?? ''
    expect(out).toContain('type: disk')
    expect(out).toContain('id: disk0')
  })

  it('flags invalid raw storage YAML and falls back to guided LVM', () => {
    const s = freshDefaultSpec()
    Object.assign(s.target, { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' })
    s.storage.scheme = 'manual'
    s.scripts.rawAutoinstallStorage = 'config: [unterminated'
    const { files, diagnostics } = emitAutoinstall(s)
    expect(diagnostics.some((d) => d.field === 'scripts.rawAutoinstallStorage')).toBe(true)
    expect(files[0]?.content).toContain('name: lvm')
  })

  it('is deterministic (same spec → identical bytes)', () => {
    expect(emitAutoinstall(minimalUbuntu).files[0]?.content).toBe(
      emitAutoinstall(minimalUbuntu).files[0]?.content,
    )
  })
})
