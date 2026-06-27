import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadText } from './download'

describe('downloadText', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates a blob URL, clicks an anchor, and revokes the URL', () => {
    const create = vi.fn((_blob: Blob) => 'blob:mock')
    const revoke = vi.fn()
    // jsdom does not implement these; define them for the test.
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadText('ks.cfg', 'lang en_US.UTF-8\n')

    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('blob:mock')
  })
})
