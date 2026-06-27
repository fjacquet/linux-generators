import { freshDefaultSpec } from '@engines/model'
import { describe, expect, it } from 'vitest'
import { emitKickstart } from './emitKickstart'

describe('emitKickstart variants', () => {
  it('omits the AppArmor warning when apparmor is disabled', () => {
    const s = freshDefaultSpec()
    s.security.apparmor = 'disabled'
    expect(emitKickstart(s).diagnostics).toHaveLength(0)
  })

  it('includes a build-stamp comment when set', () => {
    const s = freshDefaultSpec()
    s.meta.buildStamp = '2026062701'
    expect(emitKickstart(s).files[0]?.content).toContain('# build-stamp: 2026062701')
  })

  it('emits url and repo install-source lines', () => {
    const s = freshDefaultSpec()
    s.packages.installUrl = 'https://mirror.example/os'
    s.packages.repos = [{ name: 'extras', baseurl: 'https://mirror.example/extras' }]
    const out = emitKickstart(s).files[0]?.content ?? ''
    expect(out).toContain('url --url="https://mirror.example/os"')
    expect(out).toContain('repo --name=extras --baseurl=https://mirror.example/extras')
  })

  it('emits a %pre block from pre scripts', () => {
    const s = freshDefaultSpec()
    s.scripts.pre = ['echo preflight']
    const out = emitKickstart(s).files[0]?.content ?? ''
    expect(out).toContain('%pre --log=/var/log/ks-pre.log')
    expect(out).toContain('echo preflight')
  })
})
