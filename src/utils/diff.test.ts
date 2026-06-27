import { describe, expect, it } from 'vitest'
import { diffLines } from './diff'

describe('diffLines', () => {
  it('marks identical text as all same', () => {
    expect(diffLines('a\nb', 'a\nb').every((d) => d.tag === 'same')).toBe(true)
  })

  it('marks a changed middle line as del + add', () => {
    const d = diffLines('a\nb\nc', 'a\nX\nc')
    expect(d).toContainEqual({ tag: 'del', text: 'b' })
    expect(d).toContainEqual({ tag: 'add', text: 'X' })
    expect(d.filter((x) => x.tag === 'same').map((x) => x.text)).toEqual(['a', 'c'])
  })

  it('falls back to positional diff above the line cap without throwing', () => {
    const big = Array.from({ length: 1100 }, (_, i) => `line ${i}`).join('\n')
    const d = diffLines(big, big)
    expect(d.length).toBe(1100)
    expect(d.every((x) => x.tag === 'same')).toBe(true)
  })
})
