import { describe, expect, it } from 'vitest'
import { emit } from '../emit'
import { freshDefaultSpec } from '../model'
import { classifyFidelity, roundTrip } from './roundTrip'

describe('roundTrip', () => {
  it('classifies an unchanged re-emit as exact', () => {
    const spec = freshDefaultSpec()
    const original = emit(spec, 'kickstart').files[0]?.content ?? ''
    expect(roundTrip(original, spec, 'kickstart').fidelity).toBe('exact')
  })

  it('classifies comment-only differences as semantic', () => {
    const spec = freshDefaultSpec()
    const original = `# a hand-written comment\n${emit(spec, 'kickstart').files[0]?.content ?? ''}`
    expect(roundTrip(original, spec, 'kickstart').fidelity).toBe('semantic')
  })

  it('classifies a dropped non-comment directive as lossy', () => {
    const spec = freshDefaultSpec()
    const original = `${emit(spec, 'kickstart').files[0]?.content ?? ''}\nzerombr\n`
    expect(roundTrip(original, spec, 'kickstart').fidelity).toBe('lossy')
  })
})

describe('classifyFidelity — duplicate-count awareness', () => {
  it('returns lossy when the re-emit has fewer occurrences of a repeated line', () => {
    const original = 'a\n%end\nb\n%end\n'
    const reemit = 'a\n%end\nb\n'
    expect(classifyFidelity(original, reemit)).toBe('lossy')
  })

  it('returns exact for byte-identical text that contains repeated lines', () => {
    const text = 'a\n%end\nb\n%end\n'
    expect(classifyFidelity(text, text)).toBe('exact')
  })

  it('returns semantic when repeated lines are preserved and only comments differ', () => {
    const original = '# comment\na\n%end\nb\n%end\n'
    const reemit = 'a\n%end\nb\n%end\n'
    expect(classifyFidelity(original, reemit)).toBe('semantic')
  })
})
