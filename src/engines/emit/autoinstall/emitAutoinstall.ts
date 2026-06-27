import { deepMerge } from '../../../utils/deepMerge'
import type { InstallSpec } from '../../model/installSpec'
import type { Diagnostic } from '../../types'
import { crossFormatDrops } from '../crossFormat'
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

/**
 * Render an InstallSpec to an Ubuntu Autoinstall `user-data` file (cloud-config
 * wrapped). Pure: same spec → same bytes. The object is assembled in canonical
 * key order, then serialized by the `yaml` library.
 */
export function emitAutoinstall(spec: InstallSpec): EmitResult {
  // Warn-only for InstallSpec features Autoinstall cannot express, and only when
  // they diverge from default (intent) — we never inject shell to fake parity.
  const diagnostics: Diagnostic[] = crossFormatDrops(spec, 'autoinstall').map((d) => ({
    severity: 'warning',
    field: d.field,
    message: d.message,
  }))

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
