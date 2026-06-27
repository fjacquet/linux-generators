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
})
