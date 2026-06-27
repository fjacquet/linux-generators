import { describe, expect, it } from 'vitest'
import { freshDefaultSpec } from '../../model'
import { emitKickstart } from './emitKickstart'
import { applyUnknownFlags } from './passthrough'

describe('applyUnknownFlags', () => {
  it('appends flags to the Nth occurrence of a command', () => {
    const cmds = ['network --device=eth0', 'network --device=eth1', 'text']
    const out = applyUnknownFlags(cmds, [{ command: 'network', index: 1, flags: ['--bindto=mac'] }])
    expect(out[0]).toBe('network --device=eth0')
    expect(out[1]).toBe('network --device=eth1 --bindto=mac')
  })
})

describe('emitKickstart passthrough', () => {
  it('rawStorage replaces engine storage and emits exactly one clearpart', () => {
    const spec = freshDefaultSpec()
    spec.passthrough.kickstart.rawStorage = [
      'clearpart --all --initlabel',
      'part /boot --size=1024',
      'volgroup vg00 pv.01',
    ]
    const content = emitKickstart(spec).files[0]?.content ?? ''
    expect(content.match(/^clearpart/gm)?.length).toBe(1)
    expect(content).toContain('volgroup vg00 pv.01')
    expect(content).not.toContain('autopart') // engine storage suppressed
  })

  it('appends extraCommands and extraSections verbatim', () => {
    const spec = freshDefaultSpec()
    spec.passthrough.kickstart.extraCommands = ['zerombr', 'module --name=idm --stream=DL1']
    spec.passthrough.kickstart.extraSections = [
      { header: '%addon com_redhat_kdump --enable', body: '' },
    ]
    const content = emitKickstart(spec).files[0]?.content ?? ''
    expect(content).toContain('zerombr')
    expect(content).toContain('module --name=idm --stream=DL1')
    expect(content).toContain('%addon com_redhat_kdump --enable')
  })
})
