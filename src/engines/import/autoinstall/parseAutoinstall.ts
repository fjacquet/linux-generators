// src/engines/import/autoinstall/parseAutoinstall.ts
import { fromYaml, toYaml } from '../../emit/autoinstall/yaml'
import { freshDefaultSpec } from '../../model'
import type { NetInterfaceSpec } from '../../model/installSpec'
import type { Diagnostic } from '../../types'
import type { ParseResult } from '../types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Delete a nested leaf by path, pruning parent objects that become empty. */
function deleteLeaf(root: Obj, path: string[]): void {
  const [head, ...rest] = path
  if (head === undefined) return
  if (rest.length === 0) {
    delete root[head]
    return
  }
  const child = root[head]
  if (isObj(child)) {
    deleteLeaf(child, rest)
    if (Object.keys(child).length === 0) delete root[head]
  }
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Parse a netplan ethernets map back to NetInterfaceSpec[]. Bad entries emit
 *  warnings, never throw. `consumed` lists the leaf paths that were actually
 *  mapped (per device + mode) so the caller deletes ONLY those — leaves of
 *  skipped entries survive verbatim in extraKeys. */
function parseEthernets(
  ethernets: Obj,
  diagnostics: Diagnostic[],
): { interfaces: NetInterfaceSpec[]; consumed: string[][] } {
  const result: NetInterfaceSpec[] = []
  const consumed: string[][] = []
  for (const [device, entry] of Object.entries(ethernets)) {
    if (!isObj(entry)) {
      diagnostics.push({
        severity: 'warning',
        field: 'network.ethernets',
        message: `ethernet entry for device "${device}" is not an object; skipped.`,
      })
      continue
    }
    if (entry.dhcp4 === true) {
      result.push({ device, mode: 'dhcp', ip: '', prefix: 24, gateway: '', nameservers: [] })
      consumed.push(['network', 'ethernets', device, 'dhcp4'])
      continue
    }
    // static — expect addresses[0] = "ip/prefix"
    const addrs = entry.addresses
    if (!Array.isArray(addrs) || addrs.length === 0) {
      diagnostics.push({
        severity: 'warning',
        field: 'network.ethernets',
        message: `static ethernet entry for device "${device}" has no addresses; skipped.`,
      })
      continue
    }
    const rawAddr = addrs[0]
    if (typeof rawAddr !== 'string') {
      diagnostics.push({
        severity: 'warning',
        field: 'network.ethernets',
        message: `static ethernet entry for device "${device}" has non-string addresses[0]; skipped.`,
      })
      continue
    }
    const slashIdx = rawAddr.lastIndexOf('/')
    if (slashIdx < 0) {
      diagnostics.push({
        severity: 'warning',
        field: 'network.ethernets',
        message: `ethernet address "${rawAddr}" for device "${device}" has no prefix length; skipped.`,
      })
      continue
    }
    const ip = rawAddr.slice(0, slashIdx)
    const rawPrefix = Number.parseInt(rawAddr.slice(slashIdx + 1), 10)
    if (!Number.isFinite(rawPrefix)) {
      diagnostics.push({
        severity: 'warning',
        field: 'network.ethernets',
        message: `ethernet address "${rawAddr}" for device "${device}" has non-numeric prefix; skipped.`,
      })
      continue
    }
    const prefix = rawPrefix >= 0 && rawPrefix <= 32 ? rawPrefix : 24
    if (rawPrefix !== prefix) {
      diagnostics.push({
        severity: 'warning',
        field: 'network.ethernets',
        message: `ethernet address "${rawAddr}" for device "${device}" has out-of-range prefix ${rawPrefix}; defaulting to 24.`,
      })
    }
    // gateway: gateway4 takes precedence over a default route entry
    let gateway = asString(entry.gateway4) ?? ''
    if (!gateway && Array.isArray(entry.routes)) {
      for (const route of entry.routes) {
        if (isObj(route) && route.to === 'default' && typeof route.via === 'string') {
          gateway = route.via
          break
        }
      }
    }
    // nameservers
    let nameservers: string[] = []
    if (isObj(entry.nameservers) && Array.isArray(entry.nameservers.addresses)) {
      nameservers = entry.nameservers.addresses.filter((s): s is string => typeof s === 'string')
    }
    result.push({ device, mode: 'static', ip, prefix, gateway, nameservers })
    // Only the leaves we read are consumed; routes (and any unmodeled key) survive.
    // gateway4/nameservers.addresses paths are no-ops here if absent (gateway came
    // from a route, or there were no nameservers), so listing them is safe.
    consumed.push(['network', 'ethernets', device, 'addresses'])
    consumed.push(['network', 'ethernets', device, 'gateway4'])
    consumed.push(['network', 'ethernets', device, 'nameservers', 'addresses'])
  }
  return { interfaces: result, consumed }
}

/** Parse an Autoinstall user-data file into an InstallSpec. Throws only on
 *  malformed YAML; all content problems become warnings. Pure otherwise. */
export function parseAutoinstall(text: string): ParseResult {
  const doc = fromYaml(text.replace(/^#cloud-config\s*\n/, ''))
  const ai = isObj(doc) && isObj(doc.autoinstall) ? doc.autoinstall : isObj(doc) ? doc : {}

  const spec = freshDefaultSpec()
  spec.target = { ...spec.target, osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' }
  spec.packages.groups = []
  spec.packages.individual = []
  const diagnostics: Diagnostic[] = []
  const extra = structuredClone(ai) as Obj
  const consume = (...path: string[]): void => deleteLeaf(extra, path)
  let mapped = 0

  if ('version' in ai) {
    if (ai.version !== 1)
      diagnostics.push({
        severity: 'warning',
        field: 'version',
        message: `autoinstall version ${String(ai.version)} (expected 1); imported anyway.`,
      })
    consume('version')
    mapped++
  }

  const locale = asString(ai.locale)
  if (locale) {
    spec.locale.language = locale
    consume('locale')
    mapped++
  }

  if (isObj(ai.keyboard)) {
    const kb = ai.keyboard
    const layout = asString(kb.layout)
    const variant = asString(kb.variant)
    if (layout) spec.locale.keyboard = layout
    if (variant) spec.locale.keyboardVariant = variant
    consume('keyboard', 'layout')
    consume('keyboard', 'variant')
    mapped++
  }

  const tz = asString(ai.timezone)
  if (tz) {
    spec.locale.timezone = tz
    consume('timezone')
    mapped++
  }

  if (isObj(ai.identity)) {
    const id = ai.identity
    const hostname = asString(id.hostname)
    const username = asString(id.username)
    const realname = asString(id.realname)
    const password = asString(id.password)
    if (hostname) {
      spec.network.hostname = hostname
      consume('identity', 'hostname')
    }
    if (username) {
      spec.identity.primaryUser.name = username
      consume('identity', 'username')
    }
    if (realname) {
      spec.identity.primaryUser.gecos = realname
      consume('identity', 'realname')
    }
    if (password) {
      spec.identity.primaryUser.passwordMode = 'hashed'
      spec.identity.primaryUser.passwordCrypt = password
      consume('identity', 'password')
    }
    mapped++
  }

  if (isObj(ai.ssh)) {
    const ssh = ai.ssh
    spec.security.sshHardening.passwordAuth = ssh['allow-pw'] === true
    const keys = ssh['authorized-keys']
    if (Array.isArray(keys))
      spec.identity.primaryUser.sshKeys = keys.filter((k): k is string => typeof k === 'string')
    // NOTE: 'install-server' is not modelled — intentionally not consumed so it survives in extraKeys.
    consume('ssh', 'allow-pw')
    consume('ssh', 'authorized-keys')
    mapped++
  }

  // network.ethernets → spec.network.interfaces (inverse of buildEthernets)
  if (isObj(ai.network)) {
    const net = ai.network
    if (isObj(net.ethernets)) {
      const { interfaces, consumed } = parseEthernets(net.ethernets, diagnostics)
      if (interfaces.length > 0) spec.network.interfaces = interfaces
      // Consume only the leaves parseEthernets actually mapped; unmodeled keys
      // (mtu, match, dhcp6, nameservers.search, …) and the leaves of skipped
      // entries survive in extraKeys.
      // NOTE: 'routes' is intentionally NOT consumed — if gateway4 is present it
      // wins; on re-emit the emitter emits gateway4 + deepMerge puts routes back;
      // re-parse maps gateway4→gateway and keeps routes in extraKeys → stable.
      for (const path of consumed) consume(...path)
      if (interfaces.length > 0) mapped++
    }
    if ('version' in net) consume('network', 'version')
  }

  if (isObj(ai.storage)) {
    if (isObj(ai.storage.layout)) {
      const layout = ai.storage.layout
      const name = asString(layout.name)
      if (name === 'direct' || name === 'lvm') {
        spec.storage.scheme = name === 'direct' ? 'autopart-plain' : 'autopart-lvm'
        const encPass = asString(layout.password)
        if (encPass) {
          spec.storage.encryption.enabled = true
          spec.storage.encryption.passphrase = encPass
        }
        // Consume only the leaves we mapped; unmodeled keys (sizing-policy, etc.) survive in extraKeys.
        consume('storage', 'layout', 'name')
        consume('storage', 'layout', 'password')
        mapped++
      } else {
        // Unknown/unsupported layout name (e.g. 'zfs', a typo): do NOT coerce to
        // LVM. Leave the whole subtree verbatim in extraKeys and warn so the
        // original survives the round-trip instead of being silently rewritten.
        diagnostics.push({
          severity: 'warning',
          field: 'storage.layout',
          message: `unrecognized storage.layout.name "${String(layout.name)}"; preserved verbatim instead of mapping.`,
        })
      }
    }
    // storage.config → manual partitioning passthrough (round-trips via toYaml/fromYaml)
    if ('config' in ai.storage) {
      spec.storage.scheme = 'manual'
      spec.scripts.rawAutoinstallStorage = toYaml(ai.storage.config)
      consume('storage', 'config')
      mapped++
    }
  }

  // apt.primary[0].uri → spec.packages.aptMirror
  // deleteLeaf cannot recurse into arrays, so prune the mapped leaf on `extra` by hand.
  // A custom `arches` on the primary mirror is preserved in extraKeys, but due to
  // deepMerge array-replace the emitter's default arches:[default] wins on re-emit —
  // acceptable known edge; `uri` round-trips correctly.
  if (isObj(ai.apt) && Array.isArray(ai.apt.primary)) {
    const first = ai.apt.primary[0]
    if (isObj(first)) {
      const uri = asString(first.uri)
      if (uri) spec.packages.aptMirror = uri
    }
    const extraApt = extra.apt
    if (isObj(extraApt) && Array.isArray(extraApt.primary)) {
      const extraFirst = extraApt.primary[0]
      if (isObj(extraFirst)) {
        delete extraFirst.uri
        if (Object.keys(extraFirst).length === 0) extraApt.primary.shift()
      }
      if (extraApt.primary.length === 0) delete extraApt.primary
      if (Object.keys(extraApt).length === 0) delete extra.apt
    }
    mapped++
  }

  if (Array.isArray(ai.packages)) {
    spec.packages.individual = ai.packages.filter((p): p is string => typeof p === 'string')
    consume('packages')
    mapped++
  }

  for (const key of ['early-commands', 'late-commands'] as const) {
    const cmds = ai[key]
    if (Array.isArray(cmds)) {
      const list = cmds.filter((c): c is string => typeof c === 'string')
      if (key === 'early-commands') spec.scripts.earlyCommands = list
      else spec.scripts.lateCommands = list
      consume(key)
      mapped++
    }
  }

  // user-data → rawAutoinstallUserData passthrough (round-trips with emitAutoinstall)
  if ('user-data' in ai) {
    spec.scripts.rawAutoinstallUserData = toYaml(ai['user-data'])
    consume('user-data')
    mapped++
  }

  // `shutdown` is NOT consumed — it survives into extraKeys and is passed through
  // by the emitter, so custom values (e.g. 'poweroff') round-trip correctly.

  spec.passthrough.autoinstall.extraKeys = extra
  const passthroughCount = Object.keys(extra).length
  return { spec, diagnostics, mappedCount: mapped, passthroughCount }
}
