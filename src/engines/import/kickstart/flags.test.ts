import { describe, expect, it } from 'vitest'
import { parseFlags } from './flags'

describe('parseFlags', () => {
  it('parses --k=v, --k v, bare flags, and positionals', () => {
    const { flags, positionals } = parseFlags('--name=admin --groups wheel,kvm --plaintext root')
    expect(flags).toContainEqual({ key: 'name', value: 'admin', raw: '--name=admin' })
    expect(flags).toContainEqual({ key: 'groups', value: 'wheel,kvm', raw: '--groups wheel,kvm' })
    expect(flags).toContainEqual({ key: 'plaintext', value: null, raw: '--plaintext' })
    expect(positionals).toEqual(['root'])
  })

  it('respects quoted values', () => {
    const { flags } = parseFlags('--gecos="System Admin"')
    expect(flags).toContainEqual({
      key: 'gecos',
      value: 'System Admin',
      raw: '--gecos="System Admin"',
    })
  })

  it('treats a leading positional (lang) correctly', () => {
    expect(parseFlags('en_US.UTF-8').positionals).toEqual(['en_US.UTF-8'])
  })
})
