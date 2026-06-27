import { describe, expect, it } from 'vitest'
import { hashPassword } from './index'
import { generateSalt } from './salt'
import { sha512crypt } from './sha512crypt'

// Canonical test vectors from Ulrich Drepper's SHA-crypt specification.
// They exercise default rounds, custom rounds, salt truncation (>16 chars),
// the rounds clamp (min 1000), and a >64-byte password.
const VECTORS: { password: string; salt: string; rounds?: number; expected: string }[] = [
  {
    password: 'Hello world!',
    salt: 'saltstring',
    expected:
      '$6$saltstring$svn8UoSVapNtMuq1ukKS4tPQd8iKwSMHWjl/O817G3uBnIFNjnQJuesI68u4OTLiBFdcbYEdFCoEOfaS35inz1',
  },
  {
    password: 'Hello world!',
    salt: 'saltstringsaltstring',
    rounds: 10000,
    expected:
      '$6$rounds=10000$saltstringsaltst$OW1/O6BYHV6BcXZu8QVeXbDWra3Oeqh0sbHbbMCVNSnCM/UrjmM0Dp8vOuZeHBy/YTBmSK6H9qs/y3RnOaw5v.',
  },
  {
    password: 'This is just a test',
    salt: 'toolongsaltstring',
    rounds: 5000,
    expected:
      '$6$rounds=5000$toolongsaltstrin$lQ8jolhgVRVhY4b5pZKaysCLi0QBxGoNeKQzQ3glMhwllF7oGDZxUhx1yxdYcz/e1JSbq3y6JMxxl8audkUEm0',
  },
  {
    password:
      'a very much longer text to encrypt.  This one even stretches over morethan one line.',
    salt: 'anotherlongsaltstring',
    rounds: 1400,
    expected:
      '$6$rounds=1400$anotherlongsalts$POfYwTEok97VWcjxIiSOjiykti.o/pQs.wPvMxQ6Fm7I6IoYN3CmLs66x9t0oSwbtEW7o7UmJEiDwGqd8p4ur1',
  },
  {
    password: 'we have a short salt string but not a short password',
    salt: 'short',
    rounds: 77777,
    expected:
      '$6$rounds=77777$short$WuQyW2YR.hBNpjjRhpYD/ifIw05xdfeEyQoMxIXbkvr0gge1a1x3yRULJ5CCaUeOxFmtlcGZelFl5CxtgfiAc0',
  },
  {
    password: 'a short string',
    salt: 'asaltof16chars..',
    rounds: 123456,
    expected:
      '$6$rounds=123456$asaltof16chars..$BtCwjqMJGx5hrJhZywWvt0RLE8uZ4oPwcelCjmw2kSYu.Ec6ycULevoBK25fs2xXgMNrCzIMVcgEJAstJeonj1',
  },
  {
    password: 'the minimum number is still observed',
    salt: 'roundstoolow',
    rounds: 10,
    expected:
      '$6$rounds=1000$roundstoolow$kUMsbe306n21p9R.FRkW3IGn.S9NPN0x50YhH1xhLsPuWGsUSklZt58jaTfF4ZEQpyUNGc0dqbpBYYBaHHrsX.',
  },
]

describe('sha512crypt vectors', () => {
  it.each(VECTORS)('matches glibc for "$password" / "$salt"', ({
    password,
    salt,
    rounds,
    expected,
  }) => {
    expect(sha512crypt(password, salt, rounds)).toBe(expected)
  })
})

describe('sha512crypt properties', () => {
  it('produces the $6$ format with an 86-char hash', () => {
    const out = sha512crypt('', 'saltsalt')
    expect(out).toMatch(/^\$6\$saltsalt\$[./0-9A-Za-z]{86}$/)
  })

  it('handles a non-ASCII password deterministically', () => {
    const a = sha512crypt('pässwörd-🔐', 'naclnacl')
    const b = sha512crypt('pässwörd-🔐', 'naclnacl')
    expect(a).toBe(b)
    expect(a).toMatch(/^\$6\$naclnacl\$/)
  })

  it('different salts yield different hashes', () => {
    expect(sha512crypt('same', 'aaaa')).not.toBe(sha512crypt('same', 'bbbb'))
  })
})

describe('generateSalt', () => {
  it('returns 16 chars from the crypt alphabet', () => {
    expect(generateSalt()).toMatch(/^[./0-9A-Za-z]{16}$/)
  })
  it('is random across calls', () => {
    expect(generateSalt()).not.toBe(generateSalt())
  })
})

describe('hashPassword', () => {
  it('hashes a plaintext to a fresh-salted $6$', () => {
    expect(hashPassword('hunter2')).toMatch(/^\$6\$[./0-9A-Za-z]{16}\$[./0-9A-Za-z]{86}$/)
  })
  it('passes through an already-hashed $6$ value unchanged', () => {
    const hash = '$6$abc$def'
    expect(hashPassword(hash)).toBe(hash)
  })
})
