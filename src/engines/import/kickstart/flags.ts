export type Flag = { key: string; value: string | null; raw: string }

const stripQuotes = (s: string): string =>
  (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))
    ? s.slice(1, -1)
    : s

/** Split on whitespace but keep quoted spans intact. */
function tokenize(args: string): string[] {
  return args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
}

/** Per-command set of options that take a value in space-separated form
 *  (`--device eth0`). Sourced from the pykickstart command reference. Options
 *  NOT listed here are boolean switches whose following token is a positional,
 *  not a value — e.g. `rootpw --iscrypted $6$…` keeps the hash as a positional.
 *  This replaces a punctuation heuristic that mis-split simple values like
 *  `--device eth0` (no `=`/`,`/`.`) into a bare flag plus a stray positional. */
const VALUE_FLAGS: Record<string, Set<string>> = {
  network: new Set([
    'bootproto',
    'dhcpclass',
    'device',
    'essid',
    'ethtool',
    'gateway',
    'hostname',
    'ip',
    'mtu',
    'nameserver',
    'netmask',
    'prefix',
    'wepkey',
    'wpakey',
    'ipv6',
    'ipv6gateway',
    'onboot',
    'bondslaves',
    'bondopts',
    'vlanid',
    'teamslaves',
    'teamconfig',
    'interfacename',
    'bridgeslaves',
    'bridgeopts',
    'bindto',
  ]),
  autopart: new Set([
    'type',
    'fstype',
    'cipher',
    'passphrase',
    'escrowcert',
    'luks-version',
    'pbkdf',
    'pbkdf-memory',
    'pbkdf-time',
    'pbkdf-iterations',
    'hw-passphrase',
  ]),
  part: new Set([
    'fstype',
    'size',
    'maxsize',
    'ondisk',
    'ondrive',
    'onbiosdisk',
    'onpart',
    'label',
    'fsoptions',
    'fsprofile',
    'mkfsoptions',
    'cipher',
    'passphrase',
    'escrowcert',
    'luks-version',
  ]),
  logvol: new Set([
    'name',
    'vgname',
    'fstype',
    'size',
    'maxsize',
    'percent',
    'label',
    'fsoptions',
    'fsprofile',
    'mkfsoptions',
    'poolname',
    'cipher',
    'passphrase',
    'escrowcert',
  ]),
  volgroup: new Set(['pesize', 'reserved-space', 'reserved-percent']),
  raid: new Set([
    'device',
    'level',
    'fstype',
    'spares',
    'label',
    'fsoptions',
    'fsprofile',
    'mkfsoptions',
    'chunksize',
    'cipher',
    'passphrase',
    'escrowcert',
  ]),
  clearpart: new Set(['disklabel', 'drives', 'list']),
  user: new Set(['name', 'gecos', 'groups', 'password', 'uid', 'gid', 'homedir', 'shell']),
  rootpw: new Set(['password']),
  sshkey: new Set(['username']),
  url: new Set(['url', 'mirrorlist', 'metalink', 'proxy']),
  repo: new Set([
    'name',
    'baseurl',
    'mirrorlist',
    'metalink',
    'cost',
    'excludepkgs',
    'includepkgs',
    'proxy',
  ]),
  keyboard: new Set(['vckeymap', 'xlayouts', 'switch']),
  lang: new Set(['addsupport']),
  timezone: new Set(['ntpservers']),
  firewall: new Set(['port', 'trust', 'service', 'remove-service']),
  services: new Set(['disabled', 'enabled']),
  bootloader: new Set([
    'append',
    'location',
    'password',
    'driveorder',
    'timeout',
    'default',
    'md5pass',
    'boot-drive',
  ]),
}

/** Fallback for commands with no metadata (unknown/passthrough directives): a
 *  token looks like a value if it contains special characters (comma, equals,
 *  colon, slash, dot) or is already quoted. Such commands are stored verbatim,
 *  so this only affects how their flags are surfaced, never round-trip fidelity. */
function looksLikeValue(token: string): boolean {
  return (
    /[,=/:.]/.test(token) ||
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  )
}

/** Parse a Kickstart command's argument string into flags + positionals. Pure.
 *  `--k=v` → {key:'k', value:'v'}; `--k v` consumes the next token as the value
 *  when `k` is a known value-option of `command` (or, for unknown commands, when
 *  the next token looks like a value); bare `--flag` → value null; non-dashed
 *  tokens are positionals. `raw` preserves the original spelling for verbatim
 *  re-emit. */
export function parseFlags(
  args: string,
  command?: string,
): { flags: Flag[]; positionals: string[] } {
  const valueFlags = command !== undefined ? VALUE_FLAGS[command] : undefined
  const tokens = tokenize(args)
  const flags: Flag[] = []
  const positionals: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as string
    if (!tok.startsWith('--')) {
      positionals.push(stripQuotes(tok))
      continue
    }
    const body = tok.slice(2)
    const eq = body.indexOf('=')
    if (eq >= 0) {
      flags.push({ key: body.slice(0, eq), value: stripQuotes(body.slice(eq + 1)), raw: tok })
      continue
    }
    const next = tokens[i + 1]
    const nextIsValueLike = next !== undefined && !next.startsWith('--')
    // Known command → consult its value-option metadata; otherwise fall back to
    // the punctuation heuristic.
    const takesValue = nextIsValueLike
      ? valueFlags !== undefined
        ? valueFlags.has(body)
        : looksLikeValue(next as string)
      : false
    if (takesValue) {
      flags.push({ key: body, value: stripQuotes(next as string), raw: `${tok} ${next}` })
      i++
    } else {
      flags.push({ key: body, value: null, raw: tok })
    }
  }
  return { flags, positionals }
}
