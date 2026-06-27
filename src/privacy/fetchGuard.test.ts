import { beforeEach, describe, expect, it, vi } from 'vitest'

// Each test re-imports the side-effect module against the isolated jsdom global
// (origin http://localhost/) so the wrappers install on pristine globals.
describe('fetchGuard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('throws PrivacyViolation on cross-origin fetch', async () => {
    await import('./fetchGuard')
    expect(() => globalThis.fetch('https://evil.example/x')).toThrow(/PrivacyViolation/)
  })

  it('throws InsecureTransportViolation on a cleartext ws:// socket', async () => {
    await import('./fetchGuard')
    expect(() => new WebSocket('ws://localhost/x')).toThrow(/InsecureTransportViolation/)
  })

  it('throws PrivacyViolation on a cross-origin wss:// socket', async () => {
    await import('./fetchGuard')
    expect(() => new WebSocket('wss://evil.example/x')).toThrow(/PrivacyViolation/)
  })

  it('throws PrivacyViolation on cross-origin XHR open', async () => {
    await import('./fetchGuard')
    const xhr = new XMLHttpRequest()
    expect(() => xhr.open('GET', 'https://evil.example/x')).toThrow(/PrivacyViolation/)
  })
})
