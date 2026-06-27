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

/** Order-insensitive set equality: same length and every element of `a` is in `b`.
 *  Robust to import/UI reordering — never compare collections via `.join(',')`. */
const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x))

const D = DEFAULT_SPEC

/**
 * The single source of truth for "warn-on-intent": a field is a drop ONLY when
 * (a) the chosen format genuinely cannot render it AND (b) its value carries
 * intent — i.e. it diverges from the default. A brand-new (or untouched) spec
 * therefore produces no cross-format noise; imported non-default values count as
 * intent automatically because they differ from the default.
 *
 * `disabled` security postures are intent-MET, not lost intent: a target that
 * lacks SELinux/AppArmor already satisfies "turn it off", so `disabled` never
 * warns. Only an active non-default posture (`permissive` / `complain`, a
 * customized active firewall) is intent worth surfacing.
 *
 * The emitters map each drop to a warning Diagnostic; the form maps the `field`
 * set to its inline "not emitted" note.
 */
export function crossFormatDrops(spec: InstallSpec, format: TargetFormat): CrossFormatDrop[] {
  const out: CrossFormatDrop[] = []
  const { security, packages, identity } = spec

  if (format === 'autoinstall') {
    // SELinux is RHEL-only. 'enforcing' (default) and 'disabled' (intent met by a
    // target that lacks SELinux) carry no lost intent — only 'permissive' does.
    if (security.selinux !== D.security.selinux && security.selinux !== 'disabled') {
      out.push({
        field: 'security.selinux',
        message: 'SELinux is RHEL-only; ignored on Ubuntu, which enforces AppArmor.',
      })
    }
    // Autoinstall has no firewall key. A disabled firewall is intent met; the
    // default ssh-only ruleset is the baseline — only a customized active ruleset
    // is lost intent.
    if (
      security.firewall.enabled &&
      !sameSet(security.firewall.services, D.security.firewall.services)
    ) {
      out.push({
        field: 'security.firewall',
        message: 'Autoinstall has no firewall key; configure ufw via late-commands if required.',
      })
    }
    // Empty groups drop nothing; the default group is the silent baseline — only a
    // non-default, non-empty group set is lost intent on Ubuntu.
    if (packages.groups.length > 0 && !sameSet(packages.groups, D.packages.groups)) {
      out.push({
        field: 'packages.groups',
        message: 'Package groups (@…) are unsupported on Ubuntu; list individual packages instead.',
      })
    }
    if (packages.installUrl !== '' || packages.repos.length > 0) {
      out.push({
        field: 'packages.repos',
        message: 'Kickstart url/repo entries are ignored on Ubuntu; set an APT mirror instead.',
      })
    }
    if (identity.rootPolicy === 'password') {
      out.push({
        field: 'identity.rootPolicy',
        message: 'Ubuntu locks the root account; configure the sudo user instead.',
      })
    }
  } else {
    // AppArmor is Ubuntu-only. 'enforce' (default) and 'disabled' (intent met)
    // carry no lost intent — only 'complain' does.
    if (security.apparmor !== D.security.apparmor && security.apparmor !== 'disabled') {
      out.push({
        field: 'security.apparmor',
        message: 'AppArmor is not configurable from Kickstart; setting ignored on this target.',
      })
    }
  }

  return out
}
