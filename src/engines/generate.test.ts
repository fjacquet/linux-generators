import { describe, expect, it } from 'vitest'
import { generate } from './generate'
import { freshDefaultSpec } from './model'

describe('generate', () => {
  it('returns the rendered file for the chosen format', () => {
    expect(generate(freshDefaultSpec(), 'kickstart').files[0]?.filename).toBe('ks.cfg')
    const ubuntu = freshDefaultSpec()
    Object.assign(ubuntu.target, { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' })
    expect(generate(ubuntu, 'autoinstall').files[0]?.filename).toBe('user-data')
    const debian = freshDefaultSpec()
    Object.assign(debian.target, { osFamily: 'debian', distro: 'debian', version: '13' })
    expect(generate(debian, 'preseed').files[0]?.filename).toBe('preseed.cfg')
  })

  it('merges engine warnings with validation diagnostics', () => {
    const s = freshDefaultSpec()
    s.security.apparmor = 'complain' // divergent from default 'enforce' → fires the cross-format engine warning
    s.identity.rootPolicy = 'password' // validation error: no hash
    const fields = generate(s, 'kickstart').diagnostics.map((d) => d.field)
    expect(fields).toContain('security.apparmor') // engine warning
    expect(fields).toContain('identity.rootPasswordCrypt') // validation error
  })
})
