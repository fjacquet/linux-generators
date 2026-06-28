import type { InstallSpec } from '../../model/installSpec'
import { prefixToNetmask } from '../kickstart/sections'

// Per-area helpers for the Debian Preseed emitter. Each returns an array of
// `d-i <owner>/<question> <type> <value>` directive lines (empty = nothing to
// emit), mirroring the line-based Kickstart `sections.ts`.

export function localeLines(spec: InstallSpec): string[] {
  const { language, keyboard, timezone, utcHardwareClock } = spec.locale
  return [
    `d-i debian-installer/locale string ${language}`,
    `d-i keyboard-configuration/xkb-keymap select ${keyboard}`,
    `d-i time/zone string ${timezone}`,
    `d-i clock-setup/utc boolean ${utcHardwareClock}`,
  ]
}

export function networkLines(spec: InstallSpec): string[] {
  const [host, domain] = spec.network.hostname.split(/\.(.+)/)
  const out: string[] = [`d-i netcfg/get_hostname string ${host}`]
  if (domain) out.push(`d-i netcfg/get_domain string ${domain}`)

  const iface = spec.network.interfaces[0]
  if (!iface) return out

  const sel = iface.device === 'link' ? 'auto' : iface.device
  out.push(`d-i netcfg/choose_interface select ${sel}`)

  if (iface.mode === 'static') {
    out.push('d-i netcfg/disable_autoconfig boolean true')
    out.push(`d-i netcfg/get_ipaddress string ${iface.ip}`)
    out.push(`d-i netcfg/get_netmask string ${prefixToNetmask(iface.prefix)}`)
    if (iface.gateway) out.push(`d-i netcfg/get_gateway string ${iface.gateway}`)
    if (iface.nameservers.length > 0)
      out.push(`d-i netcfg/get_nameservers string ${iface.nameservers.join(' ')}`)
    out.push('d-i netcfg/confirm_static boolean true')
  }

  return out
}

// Debian's stock first-user groups. `sudo` is appended explicitly when the user
// gets sudo — d-i only auto-adds it when root-login is disabled, which it isn't here.
const BASE_GROUPS = ['audio', 'cdrom', 'video', 'plugdev', 'netdev'] as const

export function identityLines(spec: InstallSpec): string[] {
  const { rootPolicy, rootPasswordCrypt, primaryUser: u } = spec.identity
  const out: string[] = []

  if (rootPolicy === 'locked') {
    out.push('d-i passwd/root-login boolean false')
  } else {
    // password → the hash; sshkey → a locked `!` hash so d-i doesn't prompt for a
    // root password (the keys themselves are installed by the late_command).
    out.push('d-i passwd/root-login boolean true')
    const hash = rootPolicy === 'password' ? rootPasswordCrypt : '!'
    out.push(`d-i passwd/root-password-crypted password ${hash}`)
  }

  out.push('d-i passwd/make-user boolean true')
  if (u.gecos) out.push(`d-i passwd/user-fullname string ${u.gecos}`)
  out.push(`d-i passwd/username string ${u.name}`)
  if (u.passwordMode === 'hashed' && u.passwordCrypt)
    out.push(`d-i passwd/user-password-crypted password ${u.passwordCrypt}`)

  const groups = u.sudo ? [...BASE_GROUPS, 'sudo'] : BASE_GROUPS
  out.push(`d-i passwd/user-default-groups string ${groups.join(' ')}`)

  return out
}

export function storageLines(spec: InstallSpec): string[] {
  if (spec.storage.scheme === 'manual') return []

  const { encryption } = spec.storage
  const method = encryption.enabled
    ? 'crypto'
    : spec.storage.scheme === 'autopart-lvm'
      ? 'lvm'
      : 'regular'

  const out: string[] = [
    `d-i partman/early_command string debconf-set partman-auto/disk "$(list-devices disk | head -n1)"`,
    `d-i partman-auto/method string ${method}`,
    'd-i partman-auto/choose_recipe select atomic',
    'd-i partman-lvm/device_remove_lvm boolean true',
    'd-i partman-md/device_remove_md boolean true',
    'd-i partman-lvm/confirm boolean true',
    'd-i partman-lvm/confirm_nooverwrite boolean true',
    'd-i partman-partitioning/confirm_write_new_label boolean true',
    'd-i partman/choose_partition select finish',
    'd-i partman/confirm boolean true',
    'd-i partman/confirm_nooverwrite boolean true',
    `d-i partman-partitioning/choose_label select ${spec.target.firmware === 'uefi' ? 'gpt' : 'msdos'}`,
  ]

  if (encryption.enabled) {
    out.push(
      `d-i partman-crypto/passphrase password ${encryption.passphrase}`,
      `d-i partman-crypto/passphrase-again password ${encryption.passphrase}`,
      'd-i partman-crypto/confirm boolean true',
      'd-i partman-crypto/confirm_nooverwrite boolean true',
    )
  }

  return out
}

export function packagesLines(spec: InstallSpec): string[] {
  let host = 'deb.debian.org'
  let dir = '/debian'
  try {
    if (spec.packages.aptMirror) {
      const u = new URL(spec.packages.aptMirror)
      host = u.hostname
      // a host-only mirror URL yields pathname '/', which is truthy — fall back
      // to the conventional archive path rather than emit `directory string /`.
      dir = u.pathname && u.pathname !== '/' ? u.pathname : '/debian'
    }
  } catch {
    // invalid URL — keep defaults
  }

  const out: string[] = [
    'd-i mirror/country string manual',
    `d-i mirror/http/hostname string ${host}`,
    `d-i mirror/http/directory string ${dir}`,
  ]

  const include = [...new Set(spec.packages.individual)]
  if (spec.identity.primaryUser.sudo && !include.includes('sudo')) include.push('sudo')
  if (include.length > 0) out.push(`d-i pkgsel/include string ${include.join(' ')}`)

  out.push('d-i pkgsel/upgrade select none')
  out.push('tasksel tasksel/first multiselect standard')

  return out
}

export function finishingLines(_spec: InstallSpec): string[] {
  return [
    'd-i grub-installer/only_debian boolean true',
    'd-i grub-installer/with_other_os boolean true',
    // `bootdev string default` is required — without it d-i prompts for the boot device.
    'd-i grub-installer/bootdev string default',
    'd-i finish-install/reboot_in_progress note',
  ]
}
