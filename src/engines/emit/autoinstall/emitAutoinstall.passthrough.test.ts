import { describe, expect, it } from 'vitest'
import { freshDefaultSpec } from '../../model'
import { emitAutoinstall } from './emitAutoinstall'
import { fromYaml } from './yaml'

const ai = (content: string) =>
  (fromYaml(content.replace(/^#cloud-config\n/, '')) as { autoinstall: Record<string, unknown> })
    .autoinstall

describe('emitAutoinstall passthrough', () => {
  it('deep-merges unknown extraKeys while modeled keys win', () => {
    const spec = freshDefaultSpec()
    spec.target = { ...spec.target, osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' }
    spec.passthrough.autoinstall.extraKeys = {
      snaps: { install: [{ name: 'microk8s' }] },
      identity: { shell: '/bin/zsh' }, // sibling of modeled identity.hostname
    }
    // biome-ignore lint/style/noNonNullAssertion: engine always returns exactly one file
    const out = ai(emitAutoinstall(spec).files[0]!.content)
    expect(out.snaps).toEqual({ install: [{ name: 'microk8s' }] })
    const identity = out.identity as Record<string, unknown>
    expect(identity.shell).toBe('/bin/zsh')
    expect(identity.hostname).toBe(spec.network.hostname) // modeled value preserved
  })
})
