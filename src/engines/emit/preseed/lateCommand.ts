import type { InstallSpec } from '../../model/installSpec'

// TODO(T4): assemble ONE `d-i preseed/late_command string …` from `;`-joined
// steps: (1) user .ssh/authorized_keys (+ root keys when rootPolicy=sshkey),
// (2) sshd hardening sed, (3) ufw (DEBIAN_FRONTEND=noninteractive apt + allow +
// enable) when firewall enabled, (4) AppArmor when non-default, (5)
// scripts.lateCommands rewritten `curtin in-target -- ` → `in-target `. File
// writes target /target/…; in-system commands prefixed `in-target`. Returns []
// when nothing applies.
export function buildLateCommand(_spec: InstallSpec): string[] {
  return []
}
