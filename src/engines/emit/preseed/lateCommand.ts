import type { InstallSpec } from '../../model/installSpec'

// Pure helpers — each returns the ordered shell fragments for its section.
// Fragments are joined with '; ' and wrapped in a single d-i late_command line.

// Install one account's authorized_keys. File ops run in the installer env, so
// `sshDir` is the /target-prefixed path; the optional chown must run inside the
// chroot (`in-target`), so it takes the in-system path. Root owns /root → no chown.
function authorizedKeysFragments(
  sshDir: string,
  keys: string[],
  chown?: { user: string; dir: string },
): string[] {
  if (keys.length === 0) return []
  return [
    `mkdir -p ${sshDir}`,
    ...keys.map((k) => `echo "${k}" >> ${sshDir}/authorized_keys`),
    ...(chown ? [`in-target chown -R ${chown.user}:${chown.user} ${chown.dir}`] : []),
    `chmod 700 ${sshDir}`,
    `chmod 600 ${sshDir}/authorized_keys`,
  ]
}

function userSshFragments(spec: InstallSpec): string[] {
  const u = spec.identity.primaryUser
  return authorizedKeysFragments(`/target/home/${u.name}/.ssh`, u.sshKeys, {
    user: u.name,
    dir: `/home/${u.name}/.ssh`,
  })
}

function rootSshFragments(spec: InstallSpec): string[] {
  if (spec.identity.rootPolicy !== 'sshkey') return []
  return authorizedKeysFragments('/target/root/.ssh', spec.identity.rootSshKeys)
}

function sshdHardeningFragments(spec: InstallSpec): string[] {
  const h = spec.security.sshHardening
  const frags: string[] = []
  if (!h.permitRootLogin)
    frags.push("sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin no/' /target/etc/ssh/sshd_config")
  if (!h.passwordAuth)
    frags.push(
      "sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /target/etc/ssh/sshd_config",
    )
  return frags
}

function firewallFragments(spec: InstallSpec): string[] {
  if (!spec.security.firewall.enabled) return []
  return [
    'in-target env DEBIAN_FRONTEND=noninteractive apt-get install -y ufw',
    ...spec.security.firewall.services.map((svc) => `in-target ufw allow ${svc}`),
    'in-target ufw --force enable',
  ]
}

function apparmorFragments(spec: InstallSpec): string[] {
  if (spec.security.apparmor === 'enforce') return []
  if (spec.security.apparmor === 'complain')
    return [
      'in-target env DEBIAN_FRONTEND=noninteractive apt-get install -y apparmor-utils',
      'in-target aa-complain /etc/apparmor.d/*',
    ]
  // 'disabled'
  return ['in-target systemctl disable apparmor']
}

const CURTIN_PREFIX = 'curtin in-target -- '

function lateCommandFragments(spec: InstallSpec): string[] {
  return spec.scripts.lateCommands.map((c) =>
    c.startsWith(CURTIN_PREFIX) ? `in-target ${c.slice(CURTIN_PREFIX.length)}` : c,
  )
}

export function buildLateCommand(spec: InstallSpec): string[] {
  const fragments = [
    ...userSshFragments(spec),
    ...rootSshFragments(spec),
    ...sshdHardeningFragments(spec),
    ...firewallFragments(spec),
    ...apparmorFragments(spec),
    ...lateCommandFragments(spec),
  ]
  return fragments.length === 0 ? [] : [`d-i preseed/late_command string ${fragments.join('; ')}`]
}

// `scripts.earlyCommands` map 1:1 to preseed/early_command, joined on one line.
// These run in the installer env before partitioning (no chroot), so they are
// emitted verbatim — the `curtin in-target` rewrite applies only to late commands.
export function buildEarlyCommand(spec: InstallSpec): string[] {
  const cmds = spec.scripts.earlyCommands
  return cmds.length === 0 ? [] : [`d-i preseed/early_command string ${cmds.join('; ')}`]
}
