// FOUC-prevention for the dark-mode toggle. Externalised from index.html so a
// strict CSP (script-src 'self') applies. Runs before first paint.
;(() => {
  var pref = null
  try {
    pref = localStorage.getItem('lg-theme')
  } catch (_) {}
  var resolved =
    pref === 'light' || pref === 'dark'
      ? pref
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  if (resolved === 'dark') document.documentElement.classList.add('dark')
})()
