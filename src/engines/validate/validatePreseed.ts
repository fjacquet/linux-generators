import type { InstallSpec } from '../model/installSpec'
import type { Diagnostic } from '../types'

// Correctness rules for Debian Preseed. Pure: spec → diagnostics. Errors block a
// clean unattended install; warnings flag likely mistakes. Mirrors the practical
// "can you actually log in?" check from the Autoinstall validator, since Debian's
// default posture is SSH-key-first with a locked root account.
export function validatePreseed(spec: InstallSpec): Diagnostic[] {
  const d: Diagnostic[] = []

  if (!spec.network.hostname) {
    d.push({
      severity: 'error',
      field: 'network.hostname',
      message: 'Hostname is required (netcfg/get_hostname).',
    })
  }

  const user = spec.identity.primaryUser
  if (!user.name) {
    d.push({
      severity: 'error',
      field: 'identity.primaryUser.name',
      message: 'A primary user is required.',
    })
  }

  spec.network.interfaces.forEach((iface, i) => {
    if (iface.mode === 'static' && !iface.ip) {
      d.push({
        severity: 'error',
        field: `network.interfaces.${i}.ip`,
        message: 'Static interface requires an IP address.',
      })
    }
  })

  // Can you actually log in? A login path needs a real credential, not just a
  // policy toggle: a user SSH key, a user password hash, or a root account whose
  // matching credential (password hash / SSH key) is actually present. Allowing
  // SSH password auth is not itself a credential, and selecting rootPolicy
  // 'password'/'sshkey' without the hash/keys leaves root unreachable.
  const hasPassword = user.passwordMode === 'hashed' && Boolean(user.passwordCrypt)
  const rootReachable =
    (spec.identity.rootPolicy === 'password' && Boolean(spec.identity.rootPasswordCrypt)) ||
    (spec.identity.rootPolicy === 'sshkey' && spec.identity.rootSshKeys.length > 0)
  if (!hasPassword && user.sshKeys.length === 0 && !rootReachable) {
    d.push({
      severity: 'error',
      field: 'identity.primaryUser.sshKeys',
      message:
        'No login method: add an SSH key, set a user password, or configure a reachable root account (password hash or SSH key).',
    })
  }
  if (user.passwordMode === 'hashed' && !user.passwordCrypt) {
    d.push({
      severity: 'error',
      field: 'identity.primaryUser.passwordCrypt',
      message: 'User password is set to hashed but no hash is provided.',
    })
  }

  if (spec.identity.rootPolicy === 'password' && !spec.identity.rootPasswordCrypt) {
    d.push({
      severity: 'error',
      field: 'identity.rootPasswordCrypt',
      message: 'Root password policy is selected but no password hash is set.',
    })
  }
  if (spec.identity.rootPolicy === 'sshkey' && spec.identity.rootSshKeys.length === 0) {
    d.push({
      severity: 'warning',
      field: 'identity.rootSshKeys',
      message: 'Root SSH-key policy is selected but no keys are provided.',
    })
  }

  if (spec.storage.encryption.enabled && !spec.storage.encryption.passphrase) {
    d.push({
      severity: 'error',
      field: 'storage.encryption.passphrase',
      message: 'Encrypted storage requires a passphrase (partman-crypto/passphrase).',
    })
  }

  return d
}
