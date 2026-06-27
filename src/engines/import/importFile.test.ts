// src/engines/import/importFile.test.ts
import { describe, expect, it } from 'vitest'
import { emit } from '../emit'
import { freshDefaultSpec } from '../model'
import { importFile } from './importFile'

describe('importFile', () => {
  it('imports a kickstart file end to end', () => {
    const spec = freshDefaultSpec()
    const original = emit(spec, 'kickstart').files[0]?.content ?? ''
    const res = importFile(original)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.spec.target.osFamily).toBe('rhel')
      expect(res.report.fidelity).not.toBe('lossy')
    }
  })

  it('imports an autoinstall file end to end', () => {
    const spec = freshDefaultSpec()
    spec.target = { ...spec.target, osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' }
    const original = emit(spec, 'autoinstall').files[0]?.content ?? ''
    const res = importFile(original)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.spec.target.osFamily).toBe('ubuntu')
  })

  it('is idempotent: re-importing the emit of an import yields the same spec', () => {
    const start = freshDefaultSpec()
    const original = emit(start, 'kickstart').files[0]?.content ?? ''
    const first = importFile(original)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = importFile(emit(first.spec, 'kickstart').files[0]?.content ?? '')
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.spec).toEqual(first.spec)
  })

  it('hard-fails on malformed YAML autoinstall', () => {
    const res = importFile('#cloud-config\nautoinstall:\n  : : :\n')
    expect(res.ok).toBe(false)
  })

  it('falls back to the kickstart parser when detection markers are absent', () => {
    // No kickstart marker (no lang/keyboard/rootpw/autopart/%-section…) and no
    // autoinstall marker → detection ties to autoinstall with confidence 0. The
    // file is really Kickstart, and the fallback must recover it.
    const ks = [
      'network --bootproto=dhcp --device=eth0',
      'user --name=admin --groups=wheel',
      'selinux --enforcing',
      'firewall --enabled --service=ssh',
    ].join('\n')
    const res = importFile(ks)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.spec.target.osFamily).toBe('rhel')
      expect(res.spec.network.interfaces[0]?.device).toBe('eth0')
    }
  })

  it('hard-fails when neither parser recognizes any content', () => {
    const res = importFile('just\nsome\nrandom prose\n')
    expect(res.ok).toBe(false)
  })
})
