import { z } from 'zod'

// The single source of truth: one abstract, validated install specification
// that drives every per-format renderer engine. `C` = common, `KS` =
// kickstart-only, `AI` = autoinstall-only (see field comments).
//
// Engines never read anything outside this schema. Format-unique features that
// don't fit the abstraction live in `scripts.raw*` override blocks.

export const OS_FAMILIES = ['rhel', 'ubuntu'] as const
export const DISTROS = ['rhel', 'fedora', 'rocky', 'alma', 'ubuntu'] as const
export const ARCHES = ['x86_64', 'aarch64'] as const
export const FIRMWARES = ['bios', 'uefi'] as const

const Target = z.object({
  osFamily: z.enum(OS_FAMILIES), // C — selects the engine
  distro: z.enum(DISTROS), // C
  version: z.string(), // C — '9' | '10' | '40' | '24.04'
  arch: z.enum(ARCHES).default('x86_64'),
  firmware: z.enum(FIRMWARES).default('uefi'),
})

const Locale = z.object({
  language: z.string().default('en_US.UTF-8'), // C → lang / locale
  keyboard: z.string().default('us'), // C → keyboard / keyboard.layout
  keyboardVariant: z.string().default(''), // AI — keyboard.variant
  timezone: z.string().default('UTC'), // C → timezone
  utcHardwareClock: z.boolean().default(true), // KS — timezone --utc
})

const NetInterface = z.object({
  device: z.string().default('link'), // KS --device / AI ethernet key
  mode: z.enum(['dhcp', 'static']).default('dhcp'),
  ip: z.string().default(''),
  prefix: z.number().int().min(0).max(32).default(24),
  gateway: z.string().default(''),
  nameservers: z.array(z.string()).default([]),
})

const Network = z.object({
  hostname: z.string().default('localhost.localdomain'), // C
  // prefault: the seed is parsed, so each interface's own field defaults fill in.
  interfaces: z.array(NetInterface).prefault([{ device: 'link', mode: 'dhcp' }]),
})

const Partition = z.object({
  mountpoint: z.string(), // '/', '/boot', '/var', 'swap'
  size: z.string(), // '1024' (MiB) | 'auto'
  fstype: z.string().default('xfs'),
  grow: z.boolean().default(false),
})

export const STORAGE_SCHEMES = ['autopart-lvm', 'autopart-plain', 'direct', 'manual'] as const

const Storage = z.object({
  scheme: z.enum(STORAGE_SCHEMES).default('autopart-lvm'), // C (guided schemes map to both)
  encryption: z
    .object({
      enabled: z.boolean().default(false),
      passphrase: z.string().default(''),
    })
    .default({ enabled: false, passphrase: '' }),
  swap: z.enum(['auto', 'none', 'size']).default('auto'), // C
  swapSizeMiB: z.number().int().positive().default(2048),
  wipe: z.boolean().default(true), // KS clearpart / AI wipe
  partitions: z.array(Partition).default([]), // KS-best-effort; AI → rawAutoinstallStorage
})

export const ROOT_POLICIES = ['locked', 'password', 'sshkey'] as const

const PrimaryUser = z.object({
  name: z.string().default('admin'),
  gecos: z.string().default(''),
  groups: z.array(z.string()).default(['wheel']), // KS wheel / AI sudo group
  sudo: z.boolean().default(true),
  sshKeys: z.array(z.string()).default([]),
  passwordMode: z.enum(['none', 'hashed']).default('none'),
  passwordCrypt: z.string().default(''), // $6$… computed client-side
})

const Identity = z.object({
  rootPolicy: z.enum(ROOT_POLICIES).default('locked'), // C (AI warns on 'password')
  rootPasswordCrypt: z.string().default(''), // KS rootpw --iscrypted
  rootSshKeys: z.array(z.string()).default([]), // KS sshkey --username=root
  primaryUser: PrimaryUser.prefault({}), // seed {} parsed → all field defaults fill in
})

const RepoEntry = z.object({
  name: z.string(),
  baseurl: z.string(),
})

const Packages = z.object({
  groups: z.array(z.string()).default([]), // KS @groups (AI → warn)
  individual: z.array(z.string()).default([]), // C
  repos: z.array(RepoEntry).default([]), // KS repo
  installUrl: z.string().default(''), // KS url --url
  aptMirror: z.string().default(''), // AI apt.primary uri
})

const Security = z.object({
  selinux: z.enum(['enforcing', 'permissive', 'disabled']).default('enforcing'), // KS (AI → warn)
  apparmor: z.enum(['enforce', 'complain', 'disabled']).default('enforce'), // AI (KS → warn)
  firewall: z
    .object({
      enabled: z.boolean().default(true),
      services: z.array(z.string()).default(['ssh']),
    })
    .default({ enabled: true, services: ['ssh'] }),
  sshHardening: z
    .object({
      permitRootLogin: z.boolean().default(false),
      passwordAuth: z.boolean().default(false),
    })
    .default({ permitRootLogin: false, passwordAuth: false }),
})

const Scripts = z.object({
  pre: z.array(z.string()).default([]), // KS %pre
  post: z.array(z.string()).default([]), // KS %post
  earlyCommands: z.array(z.string()).default([]), // AI early-commands
  lateCommands: z.array(z.string()).default([]), // AI late-commands
  rawKickstartPre: z.string().default(''),
  rawKickstartPost: z.string().default(''),
  rawAutoinstallUserData: z.string().default(''), // AI user-data passthrough
  rawAutoinstallStorage: z.string().default(''), // AI Curtin storage.config passthrough (YAML)
})

const Passthrough = z
  .object({
    kickstart: z
      .object({
        extraCommands: z.array(z.string()).default([]),
        // index = the 0-based occurrence of `command` in the file, so re-emit appends to the right line
        unknownFlags: z
          .array(
            z.object({
              command: z.string(),
              index: z.number().int().min(0),
              flags: z.array(z.string()),
            }),
          )
          .default([]),
        extraSections: z.array(z.object({ header: z.string(), body: z.string() })).default([]),
        // all-or-nothing storage: verbatim partitioning lines that REPLACE engine storage output
        rawStorage: z.array(z.string()).default([]),
        // verbatim capture of constant-command lines, keyed by slot name
        constantLines: z.record(z.string(), z.string()).default({}),
        // section-header passthroughs (empty = use emitter default)
        packagesHeader: z.string().default(''),
        preHeader: z.string().default(''),
        postHeader: z.string().default(''),
      })
      .prefault({}),
    autoinstall: z
      .object({
        extraKeys: z.record(z.string(), z.unknown()).default({}),
      })
      .prefault({}),
  })
  .prefault({})

const Meta = z.object({
  buildStamp: z.string().default(''),
  generatorVersion: z.string().default('0.1.0'),
  profileName: z.string().default(''),
})

export const InstallSpecSchema = z.object({
  schemaVersion: z.literal(1),
  target: Target,
  locale: Locale,
  network: Network,
  storage: Storage,
  identity: Identity,
  packages: Packages,
  security: Security,
  scripts: Scripts,
  meta: Meta,
  passthrough: Passthrough,
})

export type InstallSpec = z.infer<typeof InstallSpecSchema>
export type NetInterfaceSpec = z.infer<typeof NetInterface>
export type PartitionSpec = z.infer<typeof Partition>
export type TargetFormat = 'kickstart' | 'autoinstall'

/** The OS-family ⇄ format relationship is 1:1; this is the single place it lives. */
export function defaultTargetForFormat(
  format: TargetFormat,
): Pick<InstallSpec['target'], 'osFamily' | 'distro' | 'version'> {
  return format === 'autoinstall'
    ? { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' }
    : { osFamily: 'rhel', distro: 'rhel', version: '9' }
}

export const formatForOsFamily = (osFamily: InstallSpec['target']['osFamily']): TargetFormat =>
  osFamily === 'ubuntu' ? 'autoinstall' : 'kickstart'
