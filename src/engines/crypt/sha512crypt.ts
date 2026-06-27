import { sha512 } from '@noble/hashes/sha2.js'

// SHA-512 crypt ($6$) — Ulrich Drepper's algorithm, implemented over the audited
// @noble/hashes SHA-512 primitive. Pure and deterministic given (password, salt,
// rounds). Validated against the canonical Drepper test vectors (see the test).
//
// The named npm crypt packages are unmaintained single-author modules; building
// the ~80-line wrapper on the audited noble primitive is the better supply-chain
// story for this privacy-first, offline app.

const ALPHABET = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const ROUNDS_DEFAULT = 5000
const ROUNDS_MIN = 1000
const ROUNDS_MAX = 999_999_999
const encoder = new TextEncoder()

const digest = (...parts: Uint8Array[]): Uint8Array => {
  const h = sha512.create()
  for (const p of parts) h.update(p)
  return h.digest()
}

/** Fill `length` bytes by repeating a 64-byte block (with a partial tail). */
const repeatTo = (block: Uint8Array, length: number): Uint8Array => {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = block[i % block.length] ?? 0
  return out
}

// Custom base64 with the fixed byte permutation glibc uses for SHA-512.
const PERMUTATION: [number, number, number][] = [
  [0, 21, 42],
  [22, 43, 1],
  [44, 2, 23],
  [3, 24, 45],
  [25, 46, 4],
  [47, 5, 26],
  [6, 27, 48],
  [28, 49, 7],
  [50, 8, 29],
  [9, 30, 51],
  [31, 52, 10],
  [53, 11, 32],
  [12, 33, 54],
  [34, 55, 13],
  [56, 14, 35],
  [15, 36, 57],
  [37, 58, 16],
  [59, 17, 38],
  [18, 39, 60],
  [40, 61, 19],
  [62, 20, 41],
]

const encode = (buf: Uint8Array): string => {
  const at = (i: number): number => buf[i] ?? 0
  let out = ''
  const emit = (value: number, count: number) => {
    let w = value
    for (let i = 0; i < count; i++) {
      out += ALPHABET[w & 0x3f]
      w >>>= 6
    }
  }
  for (const [a, b, c] of PERMUTATION) emit((at(a) << 16) | (at(b) << 8) | at(c), 4)
  emit(at(63), 2)
  return out
}

export function sha512crypt(password: string, salt: string, rounds?: number): string {
  const custom = rounds !== undefined
  const r = custom ? Math.min(Math.max(rounds, ROUNDS_MIN), ROUNDS_MAX) : ROUNDS_DEFAULT
  const saltStr = salt.slice(0, 16) // glibc truncates the salt to 16 chars
  const pw = encoder.encode(password)
  const saltBytes = encoder.encode(saltStr)

  // Digest B = SHA512(password + salt + password)
  const b = digest(pw, saltBytes, pw)

  // Digest A
  const aCtx = sha512.create()
  aCtx.update(pw)
  aCtx.update(saltBytes)
  for (let cnt = pw.length; cnt > 0; cnt -= 64) aCtx.update(b.subarray(0, Math.min(cnt, 64)))
  for (let n = pw.length; n > 0; n >>= 1) aCtx.update((n & 1) === 1 ? b : pw)
  let last = aCtx.digest()

  // P sequence (per-password) and S sequence (per-salt)
  const dpCtx = sha512.create()
  for (let i = 0; i < pw.length; i++) dpCtx.update(pw)
  const p = repeatTo(dpCtx.digest(), pw.length)

  const dsCtx = sha512.create()
  const saltReps = 16 + (last[0] ?? 0)
  for (let i = 0; i < saltReps; i++) dsCtx.update(saltBytes)
  const s = repeatTo(dsCtx.digest(), saltBytes.length)

  // Stretch
  for (let i = 0; i < r; i++) {
    const c = sha512.create()
    c.update((i & 1) === 1 ? p : last)
    if (i % 3 !== 0) c.update(s)
    if (i % 7 !== 0) c.update(p)
    c.update((i & 1) === 1 ? last : p)
    last = c.digest()
  }

  const prefix = custom ? `$6$rounds=${r}$` : '$6$'
  return `${prefix}${saltStr}$${encode(last)}`
}
