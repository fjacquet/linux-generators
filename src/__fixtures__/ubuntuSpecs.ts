import { defaultTargetForFormat, freshDefaultSpec, type InstallSpec } from '@engines/model'

// Ubuntu/Autoinstall fixtures for golden-file tests. Start from the baseline,
// retarget to Ubuntu, and drop the RHEL-only package groups.

const ubuntu = (mutate: (draft: InstallSpec) => void): InstallSpec => {
  const s = freshDefaultSpec()
  Object.assign(s.target, defaultTargetForFormat('autoinstall'))
  s.packages.groups = []
  s.packages.individual = ['openssh-server']
  mutate(s)
  return s
}

export const minimalUbuntu = ubuntu((d) => {
  d.meta.profileName = 'minimal-ubuntu'
})

export const staticUbuntu = ubuntu((d) => {
  d.meta.profileName = 'static-ubuntu'
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
  d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAAUBUNTU admin@host']
})

export const encryptedUbuntu = ubuntu((d) => {
  d.meta.profileName = 'encrypted-ubuntu'
  d.storage.encryption = { enabled: true, passphrase: 'secret' }
  d.scripts.lateCommands = ['curtin in-target -- systemctl enable myservice']
})

export const AUTOINSTALL_FIXTURES: { name: string; spec: InstallSpec }[] = [
  { name: 'minimal-ubuntu', spec: minimalUbuntu },
  { name: 'static-ubuntu', spec: staticUbuntu },
  { name: 'encrypted-ubuntu', spec: encryptedUbuntu },
]
