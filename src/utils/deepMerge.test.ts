import { describe, expect, it } from 'vitest'
import { deepMerge } from './deepMerge'

describe('deepMerge', () => {
  it('recurses on nested objects, keeping loser-only keys', () => {
    expect(deepMerge({ a: { x: 1 } }, { a: { y: 2 }, b: 3 })).toEqual({ a: { x: 1, y: 2 }, b: 3 })
  })

  it('winner replaces on primitive conflict', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 1 })
  })

  it('winner array replaces loser array (no concatenation)', () => {
    expect(deepMerge({ cmds: ['a'] }, { cmds: ['b', 'c'] })).toEqual({ cmds: ['a'] })
  })

  it('does not mutate inputs', () => {
    const w = { a: { x: 1 } }
    const l = { a: { y: 2 } }
    deepMerge(w, l)
    expect(w).toEqual({ a: { x: 1 } })
    expect(l).toEqual({ a: { y: 2 } })
  })
})
