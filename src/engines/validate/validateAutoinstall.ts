import type { InstallSpec } from '../model/installSpec'
import type { Diagnostic } from '../types'

// Correctness rules for Ubuntu Autoinstall, reflecting the published JSON-schema
// constraints (identity required, encryption needs a passphrase) plus a
// practical "can you actually log in?" check.
export function validateAutoinstall(spec: InstallSpec): Diagnostic[] {
  const d: Diagnostic[] = []

  if (!spec.network.hostname) {
    d.push({
      severity: 'error',
      field: 'network.hostname',
      message: 'Hostname is required for the Autoinstall identity.',
    })
  }

  const user = spec.identity.primaryUser
  if (!user.name) {
    d.push({
      severity: 'error',
      field: 'identity.primaryUser.name',
      message: 'A primary user is required for the Autoinstall identity.',
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

  const hasPassword = user.passwordMode === 'hashed' && Boolean(user.passwordCrypt)
  if (!hasPassword && user.sshKeys.length === 0 && !spec.security.sshHardening.passwordAuth) {
    d.push({
      severity: 'error',
      field: 'identity.primaryUser.sshKeys',
      message:
        'No login method: set a password, add an SSH key, or allow SSH password authentication.',
    })
  }
  if (user.passwordMode === 'hashed' && !user.passwordCrypt) {
    d.push({
      severity: 'error',
      field: 'identity.primaryUser.passwordCrypt',
      message: 'User password is set to hashed but no hash is provided.',
    })
  }

  if (spec.storage.encryption.enabled && !spec.storage.encryption.passphrase) {
    d.push({
      severity: 'error',
      field: 'storage.encryption.passphrase',
      message: 'Encrypted storage requires a passphrase on Ubuntu.',
    })
  }

  return d
}
