// Vitest + RTL bootstrap. Loaded once per worker via `setupFiles` in
// vitest.config.ts. Side effects only — no exports.
import '@testing-library/jest-dom/vitest'

// Initialize i18next with bundled resources before any component renders so
// `useTranslation()` returns real strings instead of keys during tests.
import '../i18n'

// Vitest 4's jsdom integration omits `localStorage`/`sessionStorage` from its
// `populateGlobal` key list. Reach into jsdom's own window (vitest stashes it
// on `globalThis.jsdom`) and forward storage to the test global.
interface JSDOMHandle {
  window: {
    localStorage: Storage
    sessionStorage: Storage
  }
}
const jsdomHandle = (globalThis as unknown as { jsdom?: JSDOMHandle }).jsdom
if (jsdomHandle?.window?.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      return jsdomHandle.window.localStorage
    },
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      return jsdomHandle.window.sessionStorage
    },
  })
}

// jsdom doesn't implement `window.matchMedia` — `useTheme` calls it on mount.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
