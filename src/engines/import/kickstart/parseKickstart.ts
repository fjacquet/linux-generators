// src/engines/import/kickstart/parseKickstart.ts
import { freshDefaultSpec, type InstallSpec } from '../../model'
import type { Diagnostic } from '../../types'
import type { ParseResult } from '../types'
import { type Flag, parseFlags } from './flags'
import { type KsNode, tokenizeKickstart } from './tokenize'

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
const AUTOPART_KNOWN = new Set(['type', 'encrypted', 'passphrase', 'nohome'])
const SELINUX_MODES = new Set(['enforcing', 'permissive', 'disabled'])

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
    parseFlags(autopart.args).flags.some((f) => !AUTOPART_KNOWN.has(f.key))
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
        for (const line of node.body
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)) {
          if (line.startsWith('@')) spec.packages.groups.push(line)
          else spec.packages.individual.push(line) // includes excludes like -nano, verbatim
        }
        mapped++
      } else if (header.startsWith('%pre')) {
        spec.scripts.rawKickstartPre = node.body
        mapped++
      } else if (header.startsWith('%post')) {
        spec.scripts.rawKickstartPost = node.body
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
      case 'shutdown':
      case 'firstboot':
      case 'cmdline':
      case 'graphical':
        mapped++ // emit constants — recognized and dropped
        break
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
          flags.filter((f) => f.key !== 'vckeymap' && f.key !== 'xlayouts'),
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
        const iface = {
          device: flagVal(flags, 'device') ?? 'link',
          mode: (flagVal(flags, 'bootproto') === 'static' ? 'static' : 'dhcp') as 'static' | 'dhcp',
          ip: flagVal(flags, 'ip') ?? '',
          prefix: flagVal(flags, 'netmask')
            ? netmaskToPrefix(flagVal(flags, 'netmask') as string)
            : 24,
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
          flags.filter((f) => !AUTOPART_KNOWN.has(f.key)),
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
