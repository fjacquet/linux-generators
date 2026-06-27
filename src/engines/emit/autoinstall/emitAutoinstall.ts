import { deepMerge } from '../../../utils/deepMerge'
import type { InstallSpec } from '../../model/installSpec'
import type { Diagnostic } from '../../types'
import type { EmitResult } from '../types'
import { buildEthernets, needsNetworkSection } from './netplan'
import { fromYaml, toYaml } from './yaml'

const STORAGE_LAYOUT: Record<string, string> = {
  'autopart-lvm': 'lvm',
  'autopart-plain': 'direct',
  direct: 'direct',
}

function buildStorage(spec: InstallSpec, diagnostics: Diagnostic[]): unknown {
  const { scheme, encryption } = spec.storage
  const rawStorage = spec.scripts.rawAutoinstallStorage

  if (scheme === 'manual') {
    if (rawStorage.trim()) {
      try {
        return fromYaml(rawStorage)
      } catch {
        diagnostics.push({
          severity: 'error',
          field: 'scripts.rawAutoinstallStorage',
          message: 'Raw storage override is not valid YAML; falling back to guided LVM.',
        })
      }
    } else {
      diagnostics.push({
        severity: 'warning',
        field: 'storage.scheme',
        message:
          "Manual partitioning isn't abstracted for Ubuntu; provide a raw Curtin storage.config override.",
      })
    }
  }

  const layout: Record<string, unknown> = { name: STORAGE_LAYOUT[scheme] ?? 'lvm' }
  if (encryption.enabled && encryption.passphrase) layout.password = encryption.passphrase
  return { layout }
}

/** Warn for InstallSpec features that the Autoinstall format cannot express.
 *  Warn-only: we never inject shell to fake parity. */
function crossFormatWarnings(spec: InstallSpec): Diagnostic[] {
  const out: Diagnostic[] = []
  out.push({
    severity: 'warning',
    field: 'security.selinux',
    message: 'SELinux is RHEL-only; ignored on Ubuntu, which enforces AppArmor.',
  })
  if (spec.security.firewall.enabled) {
    out.push({
      severity: 'warning',
      field: 'security.firewall',
      message: 'Autoinstall has no firewall key; configure ufw via late-commands if required.',
    })
  }
  if (spec.packages.groups.length > 0) {
    out.push({
      severity: 'warning',
      field: 'packages.groups',
      message: 'Package groups (@…) are unsupported on Ubuntu; list individual packages instead.',
    })
  }
  if (spec.packages.installUrl || spec.packages.repos.length > 0) {
    out.push({
      severity: 'warning',
      field: 'packages.repos',
      message: 'Kickstart url/repo entries are ignored on Ubuntu; set an APT mirror instead.',
    })
  }
  if (spec.identity.rootPolicy === 'password') {
    out.push({
      severity: 'warning',
      field: 'identity.rootPolicy',
      message: 'Ubuntu locks the root account; configure the sudo user instead.',
    })
  }
  return out
}

/**
 * Render an InstallSpec to an Ubuntu Autoinstall `user-data` file (cloud-config
 * wrapped). Pure: same spec → same bytes. The object is assembled in canonical
 * key order, then serialized by the `yaml` library.
 */
export function emitAutoinstall(spec: InstallSpec): EmitResult {
  const diagnostics = crossFormatWarnings(spec)

  const { primaryUser } = spec.identity
  const password =
    primaryUser.passwordMode === 'hashed' && primaryUser.passwordCrypt
      ? primaryUser.passwordCrypt
      : '!' // locked — SSH-key login

  const autoinstall: Record<string, unknown> = {
    version: 1,
    locale: spec.locale.language,
    keyboard: { layout: spec.locale.keyboard, variant: spec.locale.keyboardVariant },
    timezone: spec.locale.timezone,
    identity: {
      hostname: spec.network.hostname,
      username: primaryUser.name,
      // Only emit realname when explicitly set; omitting it avoids injecting
      // the username as gecos on re-import (idempotence invariant).
      ...(primaryUser.gecos ? { realname: primaryUser.gecos } : {}),
      password,
    },
    ssh: {
      'install-server': true,
      'allow-pw': spec.security.sshHardening.passwordAuth,
      'authorized-keys': primaryUser.sshKeys,
    },
    storage: buildStorage(spec, diagnostics),
  }

  if (needsNetworkSection(spec.network.interfaces)) {
    autoinstall.network = { version: 2, ethernets: buildEthernets(spec.network.interfaces) }
  }
  if (spec.packages.individual.length > 0) autoinstall.packages = spec.packages.individual
  if (spec.packages.aptMirror) {
    autoinstall.apt = { primary: [{ arches: ['default'], uri: spec.packages.aptMirror }] }
  }
  if (spec.scripts.earlyCommands.length > 0) {
    autoinstall['early-commands'] = spec.scripts.earlyCommands
  }
  if (spec.scripts.lateCommands.length > 0) {
    autoinstall['late-commands'] = spec.scripts.lateCommands
  }
  if (spec.scripts.rawAutoinstallUserData.trim()) {
    try {
      autoinstall['user-data'] = fromYaml(spec.scripts.rawAutoinstallUserData)
    } catch {
      diagnostics.push({
        severity: 'error',
        field: 'scripts.rawAutoinstallUserData',
        message: 'Raw user-data override is not valid YAML; omitted.',
      })
    }
  }
  const extraKeys = spec.passthrough.autoinstall.extraKeys
  // Fall back to 'reboot' only when extraKeys carries no custom shutdown value.
  autoinstall.shutdown = typeof extraKeys.shutdown === 'string' ? extraKeys.shutdown : 'reboot'
  const merged = Object.keys(extraKeys).length > 0 ? deepMerge(autoinstall, extraKeys) : autoinstall

  const stamp = spec.meta.buildStamp ? `# build-stamp: ${spec.meta.buildStamp}\n` : ''
  const content = `#cloud-config\n${stamp}${toYaml({ autoinstall: merged })}`

  return {
    files: [{ filename: 'user-data', content, language: 'yaml' }],
    diagnostics,
  }
}
