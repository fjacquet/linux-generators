import { type InstallSpec, InstallSpecSchema } from './installSpec'

// The baseline spec: SSH-key-first, locked root, enforcing SELinux/AppArmor,
// firewall + ssh, DHCP, LVM autopart. Parsing `{}` sections lets each field's
// own `.default()` fill in — one source of truth, no hand-duplicated literals.
export const DEFAULT_SPEC: InstallSpec = InstallSpecSchema.parse({
  schemaVersion: 1,
  target: { osFamily: 'rhel', distro: 'rhel', version: '9', arch: 'x86_64', firmware: 'uefi' },
  locale: {},
  network: {},
  storage: {},
  identity: {},
  packages: { groups: ['@^minimal-environment'], individual: ['openssh-server'] },
  security: {},
  scripts: {},
  meta: {},
})

/** A fresh, independently-mutable copy of the baseline (store-safe). */
export const freshDefaultSpec = (): InstallSpec => structuredClone(DEFAULT_SPEC)
