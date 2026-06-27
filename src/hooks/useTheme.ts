import { useCallback, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'lg-theme'

// Light/dark toggle. The initial class is set pre-paint by public/theme-init.js;
// this hook reads it and flips both the <html> class and the persisted choice.
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // localStorage may be unavailable (private mode); the toggle still works in-session.
      }
      return next
    })
  }, [])

  return { theme, toggle }
}
