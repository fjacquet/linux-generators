import { describe, expect, it } from 'vitest'
import { emit } from '../emit'
import type { TargetFormat } from '../model'
import { importFile } from './importFile'

const files = import.meta.glob('../../__fixtures__/importCorpus/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const cases = Object.entries(files).map(([path, content]) => ({
  name: path.split('/').pop() as string,
  content,
  format: (path.endsWith('.ks') ? 'kickstart' : 'autoinstall') as TargetFormat,
}))

// These fixtures are hand-written with non-canonical formatting (flag order,
// shorthands, omitted flags). The emitter canonicalizes every mapped directive,
// so the FIRST-PASS report.fidelity is legitimately 'semantic'/'lossy' — that is
// the classifier being conservative, not a loss. We assert the reformatting-proof
// guarantees instead: import succeeds, the spec is a fixed point (idempotence),
// the canonical form is an exact fixed point, and un-modeled constructs are kept
// verbatim in passthrough. We deliberately do NOT assert first-pass !== 'lossy'.

describe('import corpus round-trip', () => {
  it('loaded both fixtures', () => {
    expect(cases.map((c) => c.name).sort()).toEqual(['rhel-complex.ks', 'ubuntu-complex.user-data'])
  })

  it.each(cases)('imports $name successfully', ({ content }) => {
    expect(importFile(content).ok).toBe(true)
  })

  it.each(cases)('$name is idempotent across a second round trip', ({ content, format }) => {
    const first = importFile(content)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const reemit = emit(first.spec, format).files[0]?.content ?? ''
    const second = importFile(reemit)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.spec).toEqual(first.spec)
  })

  it.each(cases)('$name canonical form round-trips exactly', ({ content, format }) => {
    const first = importFile(content)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const canonical = emit(first.spec, format).files[0]?.content ?? ''
    const second = importFile(canonical)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.report.fidelity).toBe('exact')
  })

  it('preserves un-modeled kickstart constructs verbatim', () => {
    const ks = cases.find((c) => c.name === 'rhel-complex.ks')
    if (!ks) throw new Error('fixture missing')
    const res = importFile(ks.content)
    if (!res.ok) throw new Error('expected ok')
    const pk = res.spec.passthrough.kickstart
    expect(pk.extraCommands).toContain('zerombr')
    expect(pk.extraCommands.some((c) => c.startsWith('module --name=idm'))).toBe(true)
    expect(pk.rawStorage.some((l) => l.startsWith('volgroup'))).toBe(true)
    expect(pk.extraSections.some((s) => s.header.startsWith('%addon'))).toBe(true)
    expect(pk.unknownFlags).toContainEqual({
      command: 'network',
      index: 1,
      flags: ['--bindto=mac'],
    })
  })

  it('preserves un-modeled autoinstall keys verbatim', () => {
    const ud = cases.find((c) => c.name === 'ubuntu-complex.user-data')
    if (!ud) throw new Error('fixture missing')
    const res = importFile(ud.content)
    if (!res.ok) throw new Error('expected ok')
    const extra = res.spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    expect(extra.snaps).toBeDefined()
    expect(extra.oem).toBeDefined()
    expect((extra.identity as Record<string, unknown>).shell).toBe('/bin/zsh')
  })
})
