# linux-generators — Design

> Status: Phase 1 shipped (scaffold + model + Kickstart engine). The authoritative,
> full plan lives at `~/.claude/plans/agile-cooking-lantern.md`; this is the in-repo summary.

## Context

Automating Linux installs means hand-writing format-specific answer files — Kickstart (RHEL/Fedora),
Autoinstall (Ubuntu), Preseed (Debian), AutoYaST/Agama (SUSE). Each has a different schema and the
existing tooling is fragmented (Red Hat's portal generator is login-walled/RHEL-only; Canonical's
`autoinstall-generator` is a preseed→autoinstall CLI; Linuxfabrik ships static templates). Nobody
offers a unified, client-side, multi-format generator with live preview and shareable profiles. This
project fills that gap in the [vatlas](https://github.com/fjacquet/vatlas) mold: one form → a valid
install file → download, 100% client-side, deployed to GitHub Pages.

## Architecture

- **`InstallSpec`** (`src/engines/model/installSpec.ts`) — one Zod schema, the single source of
  truth. Fields are tagged common / kickstart-only / autoinstall-only.
- **Engines** (`src/engines/emit/<format>/`) — pure `(spec) => { files, diagnostics }`. Kickstart
  ships; Autoinstall (via `yaml`) is next. Version-conditional behaviour comes from a per-distro
  `quirks` table (`src/engines/emit/quirks.ts`).
- **Store** (`src/store/generatorStore.ts`) — inputs-only Zustand; the spec is replaced (never
  mutated) per edit. Opt-in, secret-stripped localStorage draft autosave arrives in Phase 4.
- **Hook** (`src/hooks/useGeneratedConfig.ts`) — the single sanctioned `useMemo`; recomputes the
  preview per keystroke.
- **UI** — a single scrolling `<form>` of collapsible sections + a sticky `PreviewPane`.

## Decisions

| Topic | Decision |
|-------|----------|
| Scope | Kickstart + Autoinstall first; Preseed + Agama later as additional engines |
| Output | Install files only — the file is the product |
| Format gaps | Warn-only; never inject functional shell workarounds |
| Storage | Guided layouts first-class for both; `manual` routes to raw overrides |
| Persistence | JSON profile export/import + presets; opt-in (default-off) draft autosave, secrets stripped |
| Passwords | SSH-key-first; optional client-side `$6$` via `@noble/hashes` + hand-rolled wrapper (vector-tested) |
| Autoinstall YAML | `yaml` (eemeli), not a hand-rolled emitter |
| Privacy | `fetchGuard` throws on any cross-origin request; CSP `connect-src 'self'` |

## Roadmap

1. **Scaffold + model + Kickstart MVP** ✅ — configs, fetchGuard, i18n, `InstallSpec`, kickstart
   engine, store/hook, Target/Locale/Storage/Identity form, golden snapshots.
2. **Autoinstall engine** — `yaml`-based emitter + netplan; FormatToggle; remaining form sections.
3. **Validation diagnostics** — ksvalidator-style + autoinstall-schema rules; DiagnosticsList.
4. **Profiles + presets + draft autosave** — JSON profiles, presets, opt-in autosave.
5. **Passwords + polish + i18n** — `$6$` hashing with a vector matrix, full i18n, integration test.

## Testing

Engines/utils/privacy are gated ≥75% (Vitest, v8). Emitters use golden-file snapshots over a fixture
matrix (`src/__fixtures__/sampleSpecs.ts`). `$6$` crypt will be validated against
`openssl passwd -6` / `mkpasswd` vectors in Phase 5.
