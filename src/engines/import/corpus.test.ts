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

// Fixtures use the emitter's canonical forms for all mapped directives so that
// reformatting does not produce false token-drops. The FIRST-PASS report.fidelity
// is legitimately 'semantic'/'lossy' for constructs the emitter re-orders (e.g.
// network flag order) — the classifier is conservative, not a loss. We assert the
// reformatting-proof guarantees: import succeeds, the spec is a fixed point
// (idempotence), the canonical form is an exact fixed point, un-modeled constructs
// are kept verbatim in passthrough, and NO original directive token is dropped on
// round-trip (the structural "nothing-dropped" assertion below).

// Tokenize non-cosmetic lines (quote-aware), normalize away quote chars so the emitter
// re-quoting a value differently (e.g. --xlayouts='fr' vs --xlayouts=fr) is not a false drop.
const TOKEN_RE = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g
const norm = (t: string): string => t.replace(/['"]/g, '')
const semanticTokens = (text: string): Set<string> => {
  const out = new Set<string>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    for (const tok of trimmed.match(TOKEN_RE) ?? []) out.add(norm(tok))
  }
  return out
}

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

  it.each(cases)('$name drops no original token on re-emit', ({ content, format }) => {
    const res = importFile(content)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const reemit = emit(res.spec, format).files[0]?.content ?? ''
    const origTokens = semanticTokens(content)
    const reemitTokens = semanticTokens(reemit)
    const dropped = [...origTokens].filter((t) => !reemitTokens.has(t))
    expect(dropped, `dropped tokens: ${dropped.join(', ')}`).toEqual([])
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
