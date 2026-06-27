import type { InstallSpec } from '../model/installSpec'
import type { Diagnostic } from '../types'

// Correctness rules for Kickstart, mirroring the spirit of `ksvalidator`.
// Pure: spec → diagnostics. Errors block a clean unattended install; warnings
// flag likely mistakes.
export function validateKickstart(spec: InstallSpec): Diagnostic[] {
  const d: Diagnostic[] = []

  spec.network.interfaces.forEach((iface, i) => {
    if (iface.mode === 'static' && !iface.ip) {
      d.push({
        severity: 'error',
        field: `network.interfaces.${i}.ip`,
        message: 'Static interface requires an IP address.',
      })
    }
  })

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

  const user = spec.identity.primaryUser
  if (user.passwordMode === 'hashed' && !user.passwordCrypt) {
    d.push({
      severity: 'error',
      field: 'identity.primaryUser.passwordCrypt',
      message: 'User password is set to hashed but no hash is provided.',
    })
  }

  if (spec.storage.scheme === 'manual') {
    if (spec.storage.partitions.length === 0) {
      d.push({
        severity: 'warning',
        field: 'storage.partitions',
        message: 'Manual partitioning is selected but no partitions are defined.',
      })
    } else if (!spec.storage.partitions.some((p) => p.mountpoint === '/')) {
      d.push({
        severity: 'warning',
        field: 'storage.partitions',
        message: 'No root (/) partition is defined.',
      })
    }
  }

  if (spec.storage.encryption.enabled && !spec.storage.encryption.passphrase) {
    d.push({
      severity: 'warning',
      field: 'storage.encryption.passphrase',
      message: 'Disk encryption is enabled but no passphrase is set; the installer will prompt.',
    })
  }

  return d
}
