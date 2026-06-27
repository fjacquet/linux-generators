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

  it('consumes space-separated simple values for known command options', () => {
    const { flags } = parseFlags('--device eth0 --bootproto dhcp', 'network')
    expect(flags).toContainEqual({ key: 'device', value: 'eth0', raw: '--device eth0' })
    expect(flags).toContainEqual({ key: 'bootproto', value: 'dhcp', raw: '--bootproto dhcp' })
  })

  it('maps a bare alphanumeric value option (autopart --type lvm)', () => {
    const { flags } = parseFlags('--type lvm', 'autopart')
    expect(flags).toContainEqual({ key: 'type', value: 'lvm', raw: '--type lvm' })
  })

  it('keeps a boolean flag bare and its following token a positional (rootpw)', () => {
    // --iscrypted is boolean for rootpw, so the hash is a positional — even when
    // it contains slashes/dots that the old punctuation heuristic misread as a value.
    const { flags, positionals } = parseFlags('--iscrypted $6$ab/cd.ef', 'rootpw')
    expect(flags).toContainEqual({ key: 'iscrypted', value: null, raw: '--iscrypted' })
    expect(positionals).toEqual(['$6$ab/cd.ef'])
  })
})
