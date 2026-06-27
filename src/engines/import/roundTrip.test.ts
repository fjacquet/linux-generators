import { describe, expect, it } from 'vitest'
import { emit } from '../emit'
import { freshDefaultSpec } from '../model'
import { roundTrip } from './roundTrip'

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
