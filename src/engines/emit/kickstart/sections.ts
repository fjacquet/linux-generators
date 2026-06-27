import type { InstallSpec } from '../../model/installSpec'

// One small pure function per directive group. Each returns the lines it owns
// (empty array = nothing to emit). `emitKickstart` joins them in canonical
// order. Keeping them separate keeps each testable and the join trivial.

/** Single source of truth for per-slot default lines — shared with the parser so
 *  constants that match the default are NOT round-tripped into constantLines. */
export const SLOT_DEFAULTS: Record<string, string> = {
  mode: 'text',
  bootloader: 'bootloader --location=mbr',
  services: 'services --enabled=sshd,chronyd',
  firstboot: 'firstboot --disable',
  power: 'reboot',
}

/** CIDR prefix → dotted-quad netmask (e.g. 24 → 255.255.255.0). */
export function prefixToNetmask(prefix: number): string {
  // `<< 32` wraps to `<< 0` in JS, so handle the 0 and 32 extremes explicitly.
  const mask = prefix <= 0 ? 0 : prefix >= 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0
  return [24, 16, 8, 0].map((shift) => (mask >>> shift) & 0xff).join('.')
}

/** A `%name … %end` block (e.g. %pre, %post). Returns [] when the body is wholly
 *  empty; preserves internal blank lines (raw script passthrough). */
export function ksBlock(header: string, body: string[]): string[] {
  if (body.every((l) => l.trim() === '')) return []
  return [header, ...body, '%end']
}

/** Return the slot value if captured during import, or the hardcoded fallback. */
export const constantLine = (spec: InstallSpec, slot: string, fallback: string): string =>
  spec.passthrough.kickstart.constantLines[slot] ?? fallback

export function localeLines(spec: InstallSpec): string[] {
  const { language, keyboard, timezone, utcHardwareClock } = spec.locale
  return [
    `lang ${language}`,
    `keyboard --vckeymap=${keyboard}`,
    `timezone ${timezone}${utcHardwareClock ? ' --utc' : ''}`,
  ]
}

export function networkLines(spec: InstallSpec): string[] {
  const { hostname, interfaces } = spec.network
  return interfaces.map((iface, i) => {
    const parts = ['network', `--device=${iface.device}`]
    if (iface.mode === 'static') {
      parts.push(
        '--bootproto=static',
        `--ip=${iface.ip}`,
        `--netmask=${prefixToNetmask(iface.prefix)}`,
      )
      if (iface.gateway) parts.push(`--gateway=${iface.gateway}`)
      if (iface.nameservers.length > 0) parts.push(`--nameserver=${iface.nameservers.join(',')}`)
    } else {
      parts.push('--bootproto=dhcp')
    }
    parts.push('--activate')
    // Hostname rides the first interface line (KS convention).
    if (i === 0) parts.push(`--hostname=${hostname}`)
    return parts.join(' ')
  })
}

export function identityLines(spec: InstallSpec): string[] {
  const { rootPolicy, rootPasswordCrypt, rootSshKeys, primaryUser } = spec.identity
  const out: string[] = []

  if (rootPolicy === 'password' && rootPasswordCrypt) {
    out.push(`rootpw --iscrypted ${rootPasswordCrypt}`)
  } else {
    out.push('rootpw --lock')
    if (rootPolicy === 'sshkey') {
      for (const key of rootSshKeys) out.push(`sshkey --username=root "${key}"`)
    }
  }

  if (primaryUser.name) {
    const groups =
      primaryUser.sudo && !primaryUser.groups.includes('wheel')
        ? [...primaryUser.groups, 'wheel']
        : primaryUser.groups
    const parts = ['user', `--name=${primaryUser.name}`]
    if (primaryUser.gecos) parts.push(`--gecos="${primaryUser.gecos}"`)
    if (groups.length > 0) parts.push(`--groups=${groups.join(',')}`)
    if (primaryUser.passwordMode === 'hashed' && primaryUser.passwordCrypt) {
      parts.push('--iscrypted', `--password=${primaryUser.passwordCrypt}`)
    }
    out.push(parts.join(' '))
    for (const key of primaryUser.sshKeys)
      out.push(`sshkey --username=${primaryUser.name} "${key}"`)
  }

  return out
}

const AUTOPART_TYPE: Record<string, string> = {
  'autopart-lvm': 'lvm',
  'autopart-plain': 'plain',
  direct: 'plain',
}

export function storageLines(spec: InstallSpec): string[] {
  const { scheme, encryption, swap, partitions, wipe } = spec.storage
  const out: string[] = []
  if (wipe) out.push('clearpart --all --initlabel')

  if (scheme === 'manual') {
    for (const p of partitions) {
      const parts = ['part', p.mountpoint, `--fstype=${p.fstype}`]
      parts.push(p.grow ? '--grow' : `--size=${p.size}`)
      out.push(parts.join(' '))
    }
    return out
  }

  const parts = ['autopart', `--type=${AUTOPART_TYPE[scheme] ?? 'lvm'}`]
  if (encryption.enabled) {
    parts.push('--encrypted')
    if (encryption.passphrase) parts.push(`--passphrase=${encryption.passphrase}`)
  }
  if (swap === 'none') parts.push('--noswap')
  out.push(parts.join(' '))
  return out
}

export function securityLines(spec: InstallSpec): string[] {
  const { selinux, firewall } = spec.security
  const out = [`selinux --${selinux}`]
  out.push(
    firewall.enabled
      ? `firewall --enabled${firewall.services.map((s) => ` --service=${s}`).join('')}`
      : 'firewall --disabled',
  )
  out.push(constantLine(spec, 'services', SLOT_DEFAULTS.services))
  return out
}

export function sourceLines(spec: InstallSpec): string[] {
  const { installUrl, repos } = spec.packages
  const out: string[] = []
  if (installUrl) out.push(`url --url="${installUrl}"`)
  for (const r of repos) out.push(`repo --name=${r.name} --baseurl=${r.baseurl}`)
  return out
}

export function bootloaderLine(_spec: InstallSpec): string {
  // Anaconda configures the ESP from autopart on UEFI; --location=mbr is the
  // portable choice that works for both firmware types.
  return SLOT_DEFAULTS.bootloader
}

export function packagesBlock(spec: InstallSpec): string[] {
  const { groups, individual } = spec.packages
  return [
    spec.passthrough.kickstart.packagesHeader || '%packages',
    ...groups,
    ...individual,
    '%end',
  ]
}

/** sshd_config edits derived from sshHardening — KS has no native directive,
 *  so a %post snippet is the canonical (non-workaround) expression. */
export function sshHardeningPost(spec: InstallSpec): string[] {
  const { permitRootLogin, passwordAuth } = spec.security.sshHardening
  return [
    `sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin ${permitRootLogin ? 'yes' : 'no'}/' /etc/ssh/sshd_config`,
    `sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication ${passwordAuth ? 'yes' : 'no'}/' /etc/ssh/sshd_config`,
  ]
}
