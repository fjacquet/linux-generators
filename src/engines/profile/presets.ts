import { defaultTargetForFormat, freshDefaultSpec, type InstallSpec } from '../model'

// Starter presets, echoing Linuxfabrik's install types. Each is a full spec the
// user can load and then tweak. structuredClone on load keeps these immutable.

const preset = (name: string, mutate: (draft: InstallSpec) => void): InstallSpec => {
  const spec = freshDefaultSpec()
  spec.meta.profileName = name
  mutate(spec)
  return spec
}

export const PRESETS = {
  minimal: preset('minimal', () => {
    // The baseline is already a minimal RHEL install.
  }),

  'hardened-cis': preset('hardened-cis', (d) => {
    d.security.selinux = 'enforcing'
    d.security.firewall = { enabled: true, services: ['ssh'] }
    d.security.sshHardening = { permitRootLogin: false, passwordAuth: false }
    d.packages.individual = ['openssh-server', 'aide', 'audit']
    d.scripts.post = ['echo "CIS baseline applied" > /etc/issue.d/10-cis.conf']
  }),

  'cloud-init': preset('cloud-init', (d) => {
    Object.assign(d.target, defaultTargetForFormat('autoinstall'))
    d.packages.groups = []
    d.packages.individual = ['cloud-init', 'openssh-server', 'qemu-guest-agent']
    d.security.firewall = { enabled: false, services: [] }
  }),
} satisfies Record<string, InstallSpec>

export type PresetName = keyof typeof PRESETS
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[]
