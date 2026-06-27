import { freshDefaultSpec, type InstallSpec } from '@engines/model'

// Reference InstallSpec inputs for golden-file/snapshot tests. Built by cloning
// the baseline and mutating — DRY, and they track schema changes automatically.

const make = (mutate: (draft: InstallSpec) => void): InstallSpec => {
  const spec = freshDefaultSpec()
  mutate(spec)
  return spec
}

export const minimalRhel = make((d) => {
  d.meta.profileName = 'minimal'
})

export const hardenedRhel = make((d) => {
  d.meta.profileName = 'hardened'
  d.storage.encryption = { enabled: true, passphrase: 'changeit' }
  d.security.selinux = 'enforcing'
  d.identity.primaryUser.name = 'operator'
  d.identity.primaryUser.gecos = 'Ops'
  d.identity.primaryUser.sshKeys = ['ssh-ed25519 AAAAEXAMPLE ops@bastion']
  d.scripts.post = ['echo hardened > /etc/issue.d/10-stamp.conf']
})

export const staticIpRhel = make((d) => {
  d.meta.profileName = 'static-ip'
  d.network.hostname = 'web01.example.com'
  d.network.interfaces = [
    {
      device: 'ens192',
      mode: 'static',
      ip: '10.0.0.10',
      prefix: 24,
      gateway: '10.0.0.1',
      nameservers: ['10.0.0.2', '1.1.1.1'],
    },
  ]
})

export const KICKSTART_FIXTURES: { name: string; spec: InstallSpec }[] = [
  { name: 'minimal-rhel', spec: minimalRhel },
  { name: 'hardened-rhel', spec: hardenedRhel },
  { name: 'static-ip-rhel', spec: staticIpRhel },
]
