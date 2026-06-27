# linux-generators

> Fill one form, get a valid unattended-install file. **100% client-side** — your
> spec never leaves the browser.

A web generator for Linux unattended-install files, built in the architectural mold of
[vatlas](https://github.com/fjacquet/vatlas). Today it emits **Kickstart** (RHEL/Fedora/Rocky/Alma);
**Ubuntu Autoinstall**, Debian Preseed, and SUSE Agama are on the roadmap. The install file is the
product — no report, no deck, no server.

## How it works

One abstract, Zod-validated `InstallSpec` is the single source of truth. Pure-function **engines**
render it per format; a single scrolling form edits it and a sticky pane live-previews the result.
Format-unique features use raw override blocks; gaps are surfaced as warnings, never worked around.

## Stack

React 19 · TypeScript (strict) · Vite 8 · Tailwind v4 · Zustand 5 (inputs-only) · Zod 4 ·
react-i18next (EN/FR/DE/IT) · `@noble/hashes` (client-side `$6$`) · `yaml` (Autoinstall) · Biome ·
Vitest. Privacy guard (`src/privacy/fetchGuard.ts`) throws on any cross-origin request.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173/linux-generators/
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run typecheck` | `tsc --noEmit` (app + tests) |
| `npm run lint` | Biome check |
| `npm run test:run` | Vitest (engines gated ≥75%) |
| `npm run test:coverage` | Coverage report |

## Documentation

- [docs/superpowers/specs/2026-06-27-linux-generators-design.md](docs/superpowers/specs/2026-06-27-linux-generators-design.md) — design & roadmap

## License

MIT.
