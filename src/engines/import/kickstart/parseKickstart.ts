// src/engines/import/kickstart/parseKickstart.ts

import { type ConstantSlot, SLOT_DEFAULTS } from '../../emit/kickstart/sections'
import { freshDefaultSpec, type InstallSpec } from '../../model'
import type { Diagnostic } from '../../types'
import type { ParseResult } from '../types'
import { type Flag, parseFlags } from './flags'
import { type KsNode, tokenizeKickstart } from './tokenize'

// command → slot mapping for constant directives captured verbatim
const CONSTANT_SLOT: Record<string, ConstantSlot> = {
  text: 'mode',
  graphical: 'mode',
  cmdline: 'mode',
  bootloader: 'bootloader',
  services: 'services',
  firstboot: 'firstboot',
  reboot: 'power',
  poweroff: 'power',
  halt: 'power',
  shutdown: 'power',
}

const STORAGE_CMDS = new Set([
  'autopart',
  'clearpart',
  'part',
  'logvol',
  'volgroup',
  'raid',
  'btrfs',
])
const COMPLEX_STORAGE = new Set(['part', 'logvol', 'volgroup', 'raid', 'btrfs'])
// flags that do NOT trigger complex-storage mode (--nohome and others pass through as unknownFlags)
const AUTOPART_NOCOMPLEX = new Set(['type', 'encrypted', 'passphrase', 'nohome'])
// flags that are consumed into the spec — others (including --nohome) pass through as unknownFlags
const AUTOPART_CONSUMED = new Set(['type', 'encrypted', 'passphrase'])
const SELINUX_MODES = new Set(['enforcing', 'permissive', 'disabled'])

// Match exactly the sed lines emitted by sshHardeningPost() so they are stripped on re-import
const PERMIT_ROOT_LOGIN_RE =
  /^sed -i 's\/\^#\\\?PermitRootLogin\.\*\/PermitRootLogin (yes|no)\/' \/etc\/ssh\/sshd_config$/
const PASSWORD_AUTH_RE =
  /^sed -i 's\/\^#\\\?PasswordAuthentication\.\*\/PasswordAuthentication (yes|no)\/' \/etc\/ssh\/sshd_config$/

const netmaskToPrefix = (mask: string): number => {
  const parts = mask.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return 24
  return parts.reduce(
    (bits, octet) => bits + ((octet >>> 0).toString(2).match(/1/g)?.length ?? 0),
    0,
  )
}

const flagVal = (flags: Flag[], key: string): string | undefined =>
  flags.find((f) => f.key === key)?.value ?? undefined
const hasFlag = (flags: Flag[], key: string): boolean => flags.some((f) => f.key === key)

/** Parse a Kickstart file into an InstallSpec. Pure; never throws on content. */
export function parseKickstart(text: string): ParseResult {
  const spec = freshDefaultSpec()
  spec.target = { ...spec.target, osFamily: 'rhel', distro: 'rhel', version: '9' }
  spec.packages.groups = []
  spec.packages.individual = []
  const diagnostics: Diagnostic[] = []
  let mapped = 0

  const nodes = tokenizeKickstart(text)
  const commands = nodes.filter(
    (n): n is Extract<KsNode, { kind: 'command' }> => n.kind === 'command',
  )

  // --- storage: all-or-nothing decision ---
  const autopart = commands.find((c) => c.name === 'autopart')
  const autopartExtra =
    autopart !== undefined &&
    parseFlags(autopart.args).flags.some((f) => !AUTOPART_NOCOMPLEX.has(f.key))
  const hasComplex = commands.some((c) => COMPLEX_STORAGE.has(c.name)) || autopartExtra
  if (hasComplex) {
    for (const c of commands)
      if (STORAGE_CMDS.has(c.name)) spec.passthrough.kickstart.rawStorage.push(c.raw)
    spec.storage.scheme = 'manual'
    spec.storage.partitions = []
  }
  const consumedByStorage = (name: string): boolean => (hasComplex ? STORAGE_CMDS.has(name) : false)

  const recordUnknownFlags = (cmd: string, index: number, unknown: Flag[]): void => {
    if (unknown.length > 0)
      spec.passthrough.kickstart.unknownFlags.push({
        command: cmd,
        index,
        flags: unknown.map((f) => f.raw),
      })
  }

  for (const node of nodes) {
    if (node.kind === 'blank' || node.kind === 'comment') continue
    if (node.kind === 'section') {
      const header = node.header
      if (header.startsWith('%packages')) {
        spec.passthrough.kickstart.packagesHeader = header
        for (const line of node.body
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)) {
          if (line.startsWith('@')) spec.packages.groups.push(line)
          else spec.packages.individual.push(line) // includes excludes like -nano, verbatim
        }
        mapped++
      } else if (header.startsWith('%pre')) {
        spec.passthrough.kickstart.preHeader = header
        spec.scripts.rawKickstartPre = node.body
        mapped++
      } else if (header.startsWith('%post')) {
        spec.passthrough.kickstart.postHeader = header
        // Strip emitter-generated ssh-hardening sed lines so they are not duplicated on re-emit.
        const remaining: string[] = []
        for (const line of node.body.split('\n')) {
          const permitMatch = line.match(PERMIT_ROOT_LOGIN_RE)
          if (permitMatch) {
            spec.security.sshHardening.permitRootLogin = (permitMatch[1] ?? 'no') === 'yes'
            continue
          }
          const passwordMatch = line.match(PASSWORD_AUTH_RE)
          if (passwordMatch) {
            spec.security.sshHardening.passwordAuth = (passwordMatch[1] ?? 'no') === 'yes'
            continue
          }
          remaining.push(line)
        }
        spec.scripts.rawKickstartPost = remaining.join('\n').trim()
        mapped++
      } else {
        spec.passthrough.kickstart.extraSections.push({ header, body: node.body })
      }
      continue
    }

    // command node
    const { name, args, index, raw } = node
    if (consumedByStorage(name)) continue
    const { flags, positionals } = parseFlags(args)

    switch (name) {
      case 'text':
      case 'reboot':
      case 'poweroff':
      case 'halt':
      case 'shutdown':
      case 'firstboot':
      case 'cmdline':
      case 'graphical':
      case 'bootloader':
      case 'services': {
        const slot = CONSTANT_SLOT[name]
        if (slot !== undefined && raw !== SLOT_DEFAULTS[slot]) {
          spec.passthrough.kickstart.constantLines[slot] = raw
        }
        mapped++
        break
      }
      case 'lang':
        if (positionals[0]) spec.locale.language = positionals[0]
        recordUnknownFlags(name, index, flags)
        mapped++
        break
      case 'keyboard':
        spec.locale.keyboard = flagVal(flags, 'vckeymap') ?? positionals[0] ?? spec.locale.keyboard
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => f.key !== 'vckeymap'),
        )
        mapped++
        break
      case 'timezone':
        if (positionals[0]) spec.locale.timezone = positionals[0]
        spec.locale.utcHardwareClock = hasFlag(flags, 'utc')
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => f.key !== 'utc'),
        )
        mapped++
        break
      case 'network': {
        const rawNetmask = flagVal(flags, 'netmask')
        const rawPrefix = rawNetmask !== undefined ? netmaskToPrefix(rawNetmask) : 24
        const prefix = rawPrefix >= 0 && rawPrefix <= 32 ? rawPrefix : 24
        if (rawNetmask !== undefined && rawPrefix !== prefix) {
          diagnostics.push({
            severity: 'warning',
            field: 'network.interfaces',
            message: `netmask "${rawNetmask}" in "${raw}" yields out-of-range prefix ${rawPrefix}; defaulting to 24.`,
          })
        }
        const iface = {
          device: flagVal(flags, 'device') ?? 'link',
          mode: (flagVal(flags, 'bootproto') === 'static' ? 'static' : 'dhcp') as 'static' | 'dhcp',
          ip: flagVal(flags, 'ip') ?? '',
          prefix,
          gateway: flagVal(flags, 'gateway') ?? '',
          nameservers: flagVal(flags, 'nameserver') ? [flagVal(flags, 'nameserver') as string] : [],
        }
        if (index === 0) spec.network.interfaces = [iface]
        else spec.network.interfaces.push(iface)
        const host = flagVal(flags, 'hostname')
        if (host) spec.network.hostname = host
        recordUnknownFlags(
          name,
          index,
          flags.filter(
            (f) =>
              ![
                'device',
                'bootproto',
                'ip',
                'netmask',
                'gateway',
                'nameserver',
                'hostname',
                'activate',
              ].includes(f.key),
          ),
        )
        mapped++
        break
      }
      case 'rootpw':
        if (hasFlag(flags, 'lock')) spec.identity.rootPolicy = 'locked'
        else if (hasFlag(flags, 'iscrypted')) {
          spec.identity.rootPolicy = 'password'
          spec.identity.rootPasswordCrypt = positionals[0] ?? ''
        }
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => f.key !== 'lock' && f.key !== 'iscrypted'),
        )
        mapped++
        break
      case 'selinux': {
        const mode = ['enforcing', 'permissive', 'disabled'].find((m) => hasFlag(flags, m))
        if (mode && SELINUX_MODES.has(mode))
          spec.security.selinux = mode as InstallSpec['security']['selinux']
        else
          diagnostics.push({
            severity: 'warning',
            field: 'security.selinux',
            message: `Unrecognized selinux mode in "${raw}"; kept default "${spec.security.selinux}".`,
          })
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => !SELINUX_MODES.has(f.key)),
        )
        mapped++
        break
      }
      case 'firewall':
        spec.security.firewall.enabled = !hasFlag(flags, 'disabled')
        spec.security.firewall.services = flags
          .filter((f) => f.key === 'service')
          .flatMap((f) => (f.value !== null ? [f.value] : []))
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => f.key !== 'enabled' && f.key !== 'disabled' && f.key !== 'service'),
        )
        mapped++
        break
      case 'autopart':
        spec.storage.scheme = flagVal(flags, 'type') === 'plain' ? 'autopart-plain' : 'autopart-lvm'
        if (hasFlag(flags, 'encrypted')) {
          spec.storage.encryption.enabled = true
          spec.storage.encryption.passphrase = flagVal(flags, 'passphrase') ?? ''
        }
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => !AUTOPART_CONSUMED.has(f.key)),
        )
        mapped++
        break
      case 'clearpart':
        spec.storage.wipe = hasFlag(flags, 'all') || hasFlag(flags, 'linux')
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => !['all', 'linux', 'none', 'initlabel'].includes(f.key)),
        )
        mapped++
        break
      case 'url':
        spec.packages.installUrl = flagVal(flags, 'url') ?? spec.packages.installUrl
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => f.key !== 'url'),
        )
        mapped++
        break
      case 'user': {
        const username = flagVal(flags, 'name')
        if (username) spec.identity.primaryUser.name = username
        const gecos = flagVal(flags, 'gecos')
        if (gecos) spec.identity.primaryUser.gecos = gecos
        const groupsVal = flagVal(flags, 'groups')
        if (groupsVal) spec.identity.primaryUser.groups = groupsVal.split(',').filter(Boolean)
        if (hasFlag(flags, 'iscrypted')) {
          spec.identity.primaryUser.passwordMode = 'hashed'
          spec.identity.primaryUser.passwordCrypt = flagVal(flags, 'password') ?? ''
        }
        recordUnknownFlags(
          name,
          index,
          flags.filter(
            (f) => !['name', 'gecos', 'groups', 'iscrypted', 'password'].includes(f.key),
          ),
        )
        mapped++
        break
      }
      case 'sshkey': {
        const sshUsername = flagVal(flags, 'username')
        const key = positionals[0]
        if (key) {
          if (sshUsername === 'root') {
            spec.identity.rootSshKeys.push(key)
            spec.identity.rootPolicy = 'sshkey'
          } else {
            spec.identity.primaryUser.sshKeys.push(key)
          }
        }
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => f.key !== 'username'),
        )
        mapped++
        break
      }
      default:
        spec.passthrough.kickstart.extraCommands.push(raw)
    }
  }

  const pk = spec.passthrough.kickstart
  const passthroughCount =
    pk.extraCommands.length +
    pk.unknownFlags.length +
    pk.extraSections.length +
    (pk.rawStorage.length > 0 ? 1 : 0)
  return { spec, diagnostics, mappedCount: mapped, passthroughCount }
}
