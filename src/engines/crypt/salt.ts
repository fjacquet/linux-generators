const SALT_ALPHABET = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** A cryptographically-random crypt salt (≤16 chars from the crypt alphabet),
 *  drawn from crypto.getRandomValues — never transmitted. */
export function generateSalt(length = 16): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let salt = ''
  for (let i = 0; i < length; i++) {
    salt += SALT_ALPHABET[(bytes[i] ?? 0) % SALT_ALPHABET.length]
  }
  return salt
}
