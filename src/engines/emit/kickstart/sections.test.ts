import { describe, expect, it } from 'vitest'
import { minimalRhel, staticIpRhel } from '@/__fixtures__/sampleSpecs'
import {
  identityLines,
  ksBlock,
  networkLines,
  prefixToNetmask,
  securityLines,
  storageLines,
} from './sections'

describe('prefixToNetmask', () => {
  it.each([
    [24, '255.255.255.0'],
    [16, '255.255.0.0'],
    [8, '255.0.0.0'],
    [32, '255.255.255.255'],
    [0, '0.0.0.0'],
    [25, '255.255.255.128'],
  ])('prefix /%i → %s', (prefix, mask) => {
    expect(prefixToNetmask(prefix)).toBe(mask)
  })
})

describe('networkLines', () => {
  it('emits dhcp with hostname on the first interface', () => {
    expect(networkLines(minimalRhel)).toEqual([
      'network --device=link --bootproto=dhcp --activate --hostname=localhost.localdomain',
    ])
  })

  it('emits static addressing with netmask, gateway and nameservers', () => {
    expect(networkLines(staticIpRhel)[0]).toBe(
      'network --device=ens192 --bootproto=static --ip=10.0.0.10 --netmask=255.255.255.0 ' +
        '--gateway=10.0.0.1 --nameserver=10.0.0.2,1.1.1.1 --activate --hostname=web01.example.com',
    )
  })
})

describe('identityLines', () => {
  it('locks root and creates a sudo user by default', () => {
    const lines = identityLines(minimalRhel)
    expect(lines[0]).toBe('rootpw --lock')
    expect(lines.some((l) => l.startsWith('user --name=admin'))).toBe(true)
    expect(lines.some((l) => l.includes('--groups=wheel'))).toBe(true)
  })
})

describe('storageLines', () => {
  it('wipes then autoparts with LVM', () => {
    expect(storageLines(minimalRhel)).toEqual([
      'clearpart --all --initlabel',
      'autopart --type=lvm',
    ])
  })
})

describe('securityLines', () => {
  it('enforces SELinux and enables ssh in the firewall', () => {
    const lines = securityLines(minimalRhel)
    expect(lines).toContain('selinux --enforcing')
    expect(lines).toContain('firewall --enabled --service=ssh')
  })
})

describe('ksBlock', () => {
  it('returns [] for an empty body', () => {
    expect(ksBlock('%post', ['', '  '])).toEqual([])
  })
  it('wraps a non-empty body in header/%end', () => {
    expect(ksBlock('%post', ['echo hi'])).toEqual(['%post', 'echo hi', '%end'])
  })
})
