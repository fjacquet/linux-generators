import type { InstallSpec } from '../../model/installSpec'

// Per-area helpers for the Debian Preseed emitter. Each returns an array of
// `d-i <owner>/<question> <type> <value>` directive lines (empty = nothing to
// emit), mirroring the line-based Kickstart `sections.ts`.

export function localeLines(spec: InstallSpec): string[] {
  const { language, keyboard, timezone, utcHardwareClock } = spec.locale
  return [
    `d-i debian-installer/locale string ${language}`,
    `d-i keyboard-configuration/xkb-keymap select ${keyboard}`,
    `d-i time/zone string ${timezone}`,
    `d-i clock-setup/utc boolean ${utcHardwareClock}`,
  ]
}

// TODO(T3): map spec.network (hostname → get_hostname/get_domain; interfaces[0]
// dhcp → choose_interface auto; static → disable_autoconfig + get_ipaddress /
// get_netmask (prefixToNetmask) / get_gateway / get_nameservers SPACE-joined +
// confirm_static).
export function networkLines(_spec: InstallSpec): string[] {
  return []
}

// TODO(T3): passwd directives. root: locked → root-login false; password →
// root-login true + root-password-crypted <hash>; sshkey → root-login true +
// root-password-crypted `!` (locked) + keys via late_command. user: make-user
// true + user-fullname + username + user-password-crypted (when set) +
// user-default-groups (SPACE-joined; append `sudo` when primaryUser.sudo).
export function identityLines(_spec: InstallSpec): string[] {
  return []
}

// TODO(T3): partman. partman/early_command debconf-set partman-auto/disk
// "$(list-devices disk | head -n1)"; partman-auto/method {lvm|regular|crypto};
// choose_recipe atomic; full confirm boilerplate; crypto passphrase + confirms;
// device_remove_lvm/md on wipe; GPT/msdos label by firmware. scheme=manual emits
// nothing here (relies on scripts.rawPreseed).
export function storageLines(_spec: InstallSpec): string[] {
  return []
}

// TODO(T3): pkgsel/include (SPACE-joined; append `sudo` when primaryUser.sudo) +
// pkgsel/upgrade none + tasksel standard; mirror/http/{hostname,directory} parsed
// from aptMirror (default deb.debian.org /debian) + mirror/country manual.
export function packagesLines(_spec: InstallSpec): string[] {
  return []
}

export function finishingLines(_spec: InstallSpec): string[] {
  return [
    'd-i grub-installer/only_debian boolean true',
    'd-i grub-installer/with_other_os boolean true',
    // `bootdev string default` is required — without it d-i prompts for the boot device.
    'd-i grub-installer/bootdev string default',
    'd-i finish-install/reboot_in_progress note',
  ]
}
