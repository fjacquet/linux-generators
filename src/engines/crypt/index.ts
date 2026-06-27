import { generateSalt } from './salt'
import { sha512crypt } from './sha512crypt'

export { generateSalt } from './salt'
export { sha512crypt } from './sha512crypt'

/** Hash a plaintext password to a fresh-salted $6$ crypt — the convenience the
 *  UI calls. If `value` is already a $6$ hash, it is returned unchanged. */
export function hashPassword(value: string): string {
  return value.startsWith('$6$') ? value : sha512crypt(value, generateSalt())
}
