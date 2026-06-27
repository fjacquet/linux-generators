import { defaultTargetForFormat, freshDefaultSpec, type InstallSpec } from '@engines/model'

// Debian/Preseed fixtures for golden-file tests. Start from the baseline,
// retarget to Debian, and drop the RHEL-only package groups.

const debian = (mutate: (draft: InstallSpec) => void): InstallSpec => {
  const s = freshDefaultSpec()
  Object.assign(s.target, defaultTargetForFormat('preseed'))
  s.packages.groups = []
  s.packages.individual = ['openssh-server']
  mutate(s)
  return s
}

export const minimalDebian = debian((d) => {
  d.meta.profileName = 'minimal-debian'
})

export const staticDebian = debian((d) => {
  d.meta.profileName = 'static-debian'
  d.network.hostname = 'web01'
  d.network.interfaces = [
    {
      device: 'ens3',
      mode: 'static',
      ip: '10.0.0.10',
      prefix: 24,
      gateway: '10.0.0.1',
      nameservers: ['10.0.0.2'],
    },
  ]
  d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAADEBIAN admin@host']
  d.scripts.earlyCommands = ['anna-install some-udeb'] // exercises preseed/early_command in the golden
})

export const encryptedDebian = debian((d) => {
  d.meta.profileName = 'encrypted-debian'
  d.storage.encryption = { enabled: true, passphrase: 'secret' }
  d.scripts.lateCommands = ['curtin in-target -- systemctl enable myservice']
})

export const PRESEED_FIXTURES: { name: string; spec: InstallSpec }[] = [
  { name: 'minimal-debian', spec: minimalDebian },
  { name: 'static-debian', spec: staticDebian },
  { name: 'encrypted-debian', spec: encryptedDebian },
]
