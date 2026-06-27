// Runtime privacy/transport guard. Side-effect module — NO exports.
//
//   import './privacy/fetchGuard'
//
// MUST be the FIRST import in src/main.tsx. It must run before any other module
// captures a reference to `fetch`, `XMLHttpRequest`, `WebSocket`, or
// `navigator.sendBeacon`.
//
// On import it installs wrappers that throw SYNCHRONOUSLY, before any network
// operation, on:
//   - PrivacyViolation           — non-same-origin URL on fetch/XHR/sendBeacon/WebSocket
//   - InsecureTransportViolation — non-`wss:` WebSocket scheme (CWE-319)
//
// `sameOrigin` semantics:
//   - same scheme + host + port as globalThis.location.origin
//   - relative URLs (no scheme/host) are treated as same-origin
//   - malformed URLs are treated as same-origin (let downstream parse fail)
//
// Rationale: an install-file generator is 100% offline; a loud throw is
// detectable, a silent block is not.

class PrivacyViolation extends Error {
  constructor(api: string, target: string) {
    super(`PrivacyViolation: ${api} attempted to reach non-same-origin URL ${target}`)
    this.name = 'PrivacyViolation'
  }
}

class InsecureTransportViolation extends Error {
  constructor(api: string, target: string) {
    super(`InsecureTransportViolation: ${api} attempted a cleartext connection to ${target}`)
    this.name = 'InsecureTransportViolation'
  }
}

const SECURE_WS_SCHEME = 'wss:' as const

const currentOrigin = (): string | undefined =>
  globalThis.location?.origin ?? (globalThis as { origin?: string }).origin

const sameOrigin = (target: string | URL): boolean => {
  try {
    const u = typeof target === 'string' ? new URL(target, globalThis.location?.href) : target
    const origin = currentOrigin()
    if (!origin) return false
    return u.origin === origin
  } catch {
    // Relative or malformed URL: no scheme/host means the current document —
    // treat as same-origin and let downstream parsing fail naturally.
    return true
  }
}

const isSecureWsUrl = (target: string | URL): boolean => {
  try {
    const u = typeof target === 'string' ? new URL(target, globalThis.location?.href) : target
    return u.protocol === SECURE_WS_SCHEME
  } catch {
    return false
  }
}

// Idempotency: a module-scoped flag. A second `import` of the SAME module
// instance is a no-op. Tests re-import via `vi.resetModules()`.
let installed = false

if (!installed) {
  installed = true

  // 1. fetch
  const originalFetch = globalThis.fetch
  globalThis.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const target =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input
          : input instanceof Request
            ? input.url
            : ''
    if (!sameOrigin(target as string | URL)) {
      throw new PrivacyViolation('fetch', String(target))
    }
    return originalFetch(input, init)
  } as typeof fetch

  // 2. XMLHttpRequest
  if (typeof XMLHttpRequest !== 'undefined') {
    const origOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function patchedOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async?: boolean,
      user?: string | null,
      pw?: string | null,
    ): void {
      if (!sameOrigin(url)) throw new PrivacyViolation('XMLHttpRequest', String(url))
      origOpen.apply(this, [method, url, async ?? true, user ?? null, pw ?? null])
    } as XMLHttpRequest['open']
  }

  // 3. navigator.sendBeacon
  if (typeof navigator !== 'undefined') {
    const nativeBeacon =
      'sendBeacon' in navigator && typeof navigator.sendBeacon === 'function'
        ? navigator.sendBeacon.bind(navigator)
        : null
    const patchedBeacon = function patchedBeacon(
      url: string | URL,
      data?: BodyInit | null,
    ): boolean {
      if (!sameOrigin(url)) throw new PrivacyViolation('sendBeacon', String(url))
      return nativeBeacon ? nativeBeacon(url, data ?? null) : true
    } as Navigator['sendBeacon']
    Object.defineProperty(navigator, 'sendBeacon', {
      value: patchedBeacon,
      writable: true,
      enumerable: true,
      configurable: true,
    })
  }

  // 4. WebSocket — same-origin AND wss-only (CWE-319 mitigation).
  if (typeof WebSocket !== 'undefined') {
    const OriginalWebSocket = WebSocket
    const PatchedWebSocket = function PatchedWebSocket(
      url: string | URL,
      protocols?: string | string[],
    ) {
      // Transport-security check FIRST: a cleartext `ws:` URL must always be
      // rejected with InsecureTransportViolation (CWE-319).
      if (!isSecureWsUrl(url)) throw new InsecureTransportViolation('WebSocket', String(url))
      if (!sameOrigin(url)) throw new PrivacyViolation('WebSocket', String(url))
      return new OriginalWebSocket(url, protocols)
    } as unknown as typeof WebSocket
    Object.setPrototypeOf(PatchedWebSocket, OriginalWebSocket)
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const) {
      Object.defineProperty(PatchedWebSocket, key, {
        value: OriginalWebSocket[key],
        writable: false,
        enumerable: true,
        configurable: true,
      })
    }
    globalThis.WebSocket = PatchedWebSocket
  }
}
