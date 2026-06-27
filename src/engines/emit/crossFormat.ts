import { DEFAULT_SPEC, type InstallSpec, type TargetFormat } from '../model'

/**
 * One cross-format field whose intent the chosen target cannot express.
 * `field` is a dotted InstallSpec path (anchors the form note + the diagnostic);
 * `message` is the English diagnostic text shown in the DiagnosticsList.
 */
export interface CrossFormatDrop {
  field: string
  message: string
}

/** Order- and duplicate-insensitive set equality: the two sides have the same
 *  distinct members. Robust to import/UI reordering and repeated entries — never
 *  compare collections via `.join(',')`. */
const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((x) => sb.has(x))
}

/**
 * The apt-family targets (Autoinstall/Ubuntu and Preseed/Debian) both cannot
 * express three RHEL/Kickstart-only features. Shared so they warn identically;
 * `osName` keeps each diagnostic accurate to the active target. `disabled`
 * SELinux is intent-met (the target lacks it), so only an active non-default
 * posture is lost intent; empty/default groups drop nothing.
 */
function aptFamilyDrops(spec: InstallSpec, osName: string): CrossFormatDrop[] {
  const { security, packages } = spec
  const out: CrossFormatDrop[] = []
  if (security.selinux !== DEFAULT_SPEC.security.selinux && security.selinux !== 'disabled') {
    out.push({
      field: 'security.selinux',
      message: `SELinux is RHEL-only; ignored on ${osName}, which enforces AppArmor.`,
    })
  }
  if (packages.groups.length > 0 && !sameSet(packages.groups, DEFAULT_SPEC.packages.groups)) {
    out.push({
      field: 'packages.groups',
      message: `Package groups (@…) are unsupported on ${osName}; list individual packages instead.`,
    })
  }
  if (packages.installUrl !== '' || packages.repos.length > 0) {
    out.push({
      field: 'packages.repos',
      message: `Kickstart url/repo entries are ignored on ${osName}; set an APT mirror instead.`,
    })
  }
  return out
}

/**
 * The single source of truth for "warn-on-intent": a field is a drop ONLY when
 * (a) the chosen format genuinely cannot render it AND (b) its value carries
 * intent — i.e. it diverges from the default. A brand-new/untouched spec
 * therefore produces no cross-format noise; imported non-default values count as
 * intent automatically.
 *
 * Per format:
 * - kickstart (RHEL): AppArmor is the only non-native field.
 * - autoinstall (Ubuntu): SELinux + RHEL groups + url/repo, *plus* firewall (no
 *   native key) and root-password (Ubuntu locks root).
 * - preseed (Debian): SELinux + RHEL groups + url/repo only. Firewall + AppArmor
 *   are realized in the late_command and root-password is native, so none drop.
 *
 * The emitters map each drop to a warning Diagnostic; the form maps the `field`
 * set to its inline "not emitted" note.
 */
export function crossFormatDrops(spec: InstallSpec, format: TargetFormat): CrossFormatDrop[] {
  const { security, identity } = spec

  // Kickstart (RHEL): AppArmor is Ubuntu/Debian-only. 'enforce' (default) and
  // 'disabled' (intent met) carry no lost intent — only 'complain' does.
  if (format === 'kickstart') {
    if (security.apparmor !== DEFAULT_SPEC.security.apparmor && security.apparmor !== 'disabled') {
      return [
        {
          field: 'security.apparmor',
          message: 'AppArmor is not configurable from Kickstart; setting ignored on this target.',
        },
      ]
    }
    return []
  }

  // apt-family (Autoinstall/Preseed) share the SELinux / groups / repos drops.
  const out = aptFamilyDrops(spec, format === 'preseed' ? 'Debian' : 'Ubuntu')

  // Autoinstall-only: it has no firewall key and locks the root account. Preseed
  // emits both (ufw + root-password-crypted via late_command/native), so neither
  // is a drop on Debian.
  if (format === 'autoinstall') {
    if (
      security.firewall.enabled &&
      !sameSet(security.firewall.services, DEFAULT_SPEC.security.firewall.services)
    ) {
      out.push({
        field: 'security.firewall',
        message: 'Autoinstall has no firewall key; configure ufw via late-commands if required.',
      })
    }
    if (identity.rootPolicy === 'password') {
      out.push({
        field: 'identity.rootPolicy',
        message: 'Ubuntu locks the root account; configure the sudo user instead.',
      })
    }
  }

  return out
}
