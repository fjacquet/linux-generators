import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pass-through + beacon branches. Each test re-imports against pristine globals.
describe('fetchGuard pass-through and beacons', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('calls through to the original fetch for a same-origin (relative) URL', async () => {
    const realFetch = vi.fn(async () => new Response('ok'))
    globalThis.fetch = realFetch as unknown as typeof fetch
    await import('./fetchGuard')
    await globalThis.fetch('/local/path')
    expect(realFetch).toHaveBeenCalledOnce()
  })

  it('throws for a cross-origin URL object', async () => {
    await import('./fetchGuard')
    expect(() => globalThis.fetch(new URL('https://evil.example/'))).toThrow(/PrivacyViolation/)
  })

  it('throws for a cross-origin Request object', async () => {
    await import('./fetchGuard')
    expect(() => globalThis.fetch(new Request('https://evil.example/'))).toThrow(/PrivacyViolation/)
  })

  it('blocks a cross-origin beacon but allows a same-origin one', async () => {
    await import('./fetchGuard')
    expect(() => navigator.sendBeacon('https://evil.example/')).toThrow(/PrivacyViolation/)
    expect(() => navigator.sendBeacon('/local')).not.toThrow()
  })
})
