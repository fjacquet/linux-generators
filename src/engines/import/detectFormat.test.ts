import { describe, expect, it } from 'vitest'
import { detectFormat } from './detectFormat'

describe('detectFormat', () => {
  it('detects autoinstall from #cloud-config', () => {
    expect(detectFormat('#cloud-config\nautoinstall:\n  version: 1\n').format).toBe('autoinstall')
  })

  it('detects autoinstall from a bare autoinstall: root', () => {
    expect(detectFormat('autoinstall:\n  version: 1\n').format).toBe('autoinstall')
  })

  it('detects kickstart from directives + %-sections', () => {
    expect(detectFormat('lang en_US.UTF-8\ntext\n%packages\n@core\n%end\n').format).toBe(
      'kickstart',
    )
  })

  it('reports low confidence on garbage', () => {
    expect(detectFormat('just some prose\nwith no markers').confidence).toBeLessThan(0.5)
  })
})
