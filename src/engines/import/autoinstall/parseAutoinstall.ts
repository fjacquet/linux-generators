// src/engines/import/autoinstall/parseAutoinstall.ts
import { fromYaml } from '../../emit/autoinstall/yaml'
import { freshDefaultSpec } from '../../model'
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
    consume('ssh', 'install-server')
    consume('ssh', 'allow-pw')
    consume('ssh', 'authorized-keys')
    mapped++
  }

  if (isObj(ai.storage) && isObj(ai.storage.layout)) {
    const layout = ai.storage.layout
    spec.storage.scheme = layout.name === 'direct' ? 'autopart-plain' : 'autopart-lvm'
    const encPass = asString(layout.password)
    if (encPass) {
      spec.storage.encryption.enabled = true
      spec.storage.encryption.passphrase = encPass
    }
    consume('storage', 'layout')
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

  if ('shutdown' in ai) {
    consume('shutdown')
    mapped++
  }

  spec.passthrough.autoinstall.extraKeys = extra
  const passthroughCount = Object.keys(extra).length
  return { spec, diagnostics, mappedCount: mapped, passthroughCount }
}
