# linux-generators — Round-trip import — Design

> Status: Approved design (brainstorm). Scope: parse an existing `ks.cfg` / `user-data` back
> into an `InstallSpec` so users can load and edit files they already trust. Both formats in the
> first cut. The implementation plan is generated separately by the writing-plans skill.

## Context

`linux-generators` generates install files from a shared, Zod-validated `InstallSpec` via pure
per-format engines (`emit/kickstart`, `emit/autoinstall`). Today the flow is one-way: form → file.
**Round-trip import** adds the reverse — file → `InstallSpec` → form — which is the single biggest
adoption lever, because users arrive with battle-tested files they want to tweak, not re-enter.

Import was deferred in the original build ("parsing is hard"). This design makes it tractable by
choosing an architecture that preserves the project's identity: pure functions, one source of truth
(`InstallSpec`), no parallel types.

## Locked decisions

| Topic | Decision |
|---|---|
| Formats (first cut) | **Both** Kickstart and Autoinstall. |
| Fidelity promise | **High-fidelity round-trip** = "nothing silently lost." Delivered as: map what the model knows → preserve everything else **verbatim** in passthrough → **re-emit and diff** against the original as proof. |
| Architecture | **Approach B — Spec + typed passthrough.** Pure `parse → spec`; un-modeled constructs go into typed passthrough fields; re-emit = the existing `emit(spec)` + a deterministic passthrough merge. Not byte-exact: comments and the ordering of *known* directives are canonicalized; the diff makes that visible. |
| Import UX | **Panel → review → confirm.** Paste box + file picker + drag-drop; on parse show a review (mapped count, passthrough count, fidelity badge, diff); Confirm replaces the form, Cancel discards. Non-destructive until confirmed. |
| Format detection | Auto-detect on input (autoinstall: `#cloud-config` / `autoinstall:`; kickstart: bare directives + `%`-sections), with a manual override. |
| Honest lossy point | Comments and original ordering of *known* directives are not preserved (Approach B). Every semantic value and every un-modeled construct **is** preserved. Byte-exact (Approach A, CST overlay) is explicitly out of scope. |

### Not in this design (deferred)

- **Comment / ordering preservation** (would require Approach A's CST overlay — a different, larger project).
- **Preseed / Agama import** (no emit engines for those formats yet).
- **The format-aware field policy** ("contextual fields + warn-on-intent") — a related but *independent*
  improvement to the existing app, captured as its own follow-up spec.
- Streaming / partial parsing; importing multi-document files.

## Core principle: consume-and-keep-the-remainder

Both parsers default to **preserve**; mapping is the opt-in. Anything a handler does not explicitly
claim falls into passthrough automatically. This makes "nothing silently lost" *structural* rather
than a checklist someone must keep complete. The `roundTrip` `lossy` classification (below) is the
tripwire that turns any modeling gap into a visible, testable failure instead of a silent drop.

## Architecture

### Module layout (new `src/engines/import/`, pure — mirrors `emit/`)

```
src/engines/import/
  detectFormat.ts        raw text → { format, confidence }
  kickstart/
    tokenize.ts          text → ordered nodes: command | section(header+body) | comment | blank
    flags.ts             one command's args → flags: --k=v | --k v | bare --flag | positional
    parseKickstart.ts    nodes → { specPatch, passthrough.kickstart, diagnostics }
  autoinstall/
    parseAutoinstall.ts  fromYaml() → object → { specPatch, passthrough.autoinstall, diagnostics }
  importFile.ts          detect → parse → overlay specPatch onto freshDefaultSpec() → safeParse → ImportResult
  roundTrip.ts           emit(importedSpec) ↔ original → FidelityReport
  index.ts
src/utils/diff.ts        small pure LCS line-diff (~40 lines, no dependency)
```

### Result types

```ts
type ImportResult =
  | { ok: true; spec: InstallSpec; report: FidelityReport; diagnostics: Diagnostic[] }
  | { ok: false; error: string }

type FidelityReport = {
  fidelity: 'exact' | 'semantic' | 'lossy'
  diff: DiffLine[]          // for display: original ↔ re-emitted
  mappedCount: number
  passthroughCount: number
}
```

### Data flow (no new store machinery)

`ImportPanel` calls `importFile(text)` (pure) → renders the review from `ImportResult` → on **Confirm**
calls the **existing** `loadProfile(result.spec)`. The importer never touches React/DOM; it is tested
as pure functions like every other engine.

## Model change — additive passthrough buckets

Extend `InstallSpec` with one optional, default-empty field. Backward-compatible: old profiles parse
with empty defaults; `schemaVersion` stays `1` (no migration).

```ts
const Passthrough = z.object({
  kickstart: z.object({
    extraCommands: z.array(z.string()).default([]),                 // whole commands we don't model (zerombr, module …)
    unknownFlags:  z.array(z.object({ command: z.string(), flags: z.array(z.string()) })).default([]),
    extraSections: z.array(z.object({ header: z.string(), body: z.string() })).default([]), // %addon, %anaconda …
  }).prefault({}),
  autoinstall: z.object({
    extraKeys: z.record(z.string(), z.unknown()).default({}),        // unknown autoinstall keys (snaps, oem, kernel …)
  }).prefault({}),
}).prefault({})
// InstallSpecSchema gains:  passthrough: Passthrough
```

`scripts.raw*` (user-authored override blocks) and `passthrough.*` (import-captured un-modeled
content) are kept distinct so re-export never confuses the two.

### Emit merges passthrough (small pure helpers; `sections.ts` untouched)

- **Kickstart** (`emitKickstart`): append `extraCommands` as a block in the command area;
  `applyUnknownFlags(commands, unknownFlags)` appends extra flags to the matching rendered line;
  re-emit `extraSections` verbatim after `%pre`/`%post`. On import, `%pre`/`%post` *bodies* map to the
  existing `scripts.rawKickstartPre/Post`.
- **Autoinstall** (`emitAutoinstall`): `deepMerge(autoinstall, extraKeys)` where modeled keys win;
  `user-data` / `storage.config` map to the existing `rawAutoinstallUserData` / `rawAutoinstallStorage`.

## Parsers

### Kickstart (`import/kickstart/`)

- `tokenize.ts`: lines → ordered nodes. Sections (`%packages`, `%pre`, `%post`, `%addon`, `%anaconda`, …)
  collect their body until `%end`. Comments (`#…`) and blanks are their own nodes. Otherwise: a command
  (first word = name).
- `flags.ts`: a command's argument string → flags, handling `--k=v`, `--k v`, bare `--flag`, and
  positionals (`lang en_US.UTF-8`). Pure, unit-tested.
- `parseKickstart.ts`: dispatch table of known command → handler writing spec fields:
  `lang`→locale.language · `keyboard`→locale.keyboard · `timezone … --utc`→timezone + utcHardwareClock ·
  `network`→a `NetInterface` (bootproto, ip + netmask→prefix, gateway, nameserver, hostname) ·
  `rootpw --lock|--iscrypted`→identity.rootPolicy + rootPasswordCrypt · `sshkey --username=root`→rootSshKeys ·
  `user`→primaryUser · `autopart --type=`→storage.scheme · `part`/`logvol`/`volgroup`→scheme=`manual` +
  best-effort partitions (else passthrough) · `clearpart`→storage.wipe · `bootloader`→firmware hint ·
  `selinux`→security.selinux · `firewall`→security.firewall · `services`→ · `url`/`repo`→packages ·
  `text`/`reboot`/`firstboot`→recognized-and-dropped (emit constants).
  Remainder rule: **unknown command → `extraCommands`; unmodeled flag on a known command → `unknownFlags`;
  non-pre/post section → `extraSections`; `%pre`/`%post` body → `rawKickstartPre/Post`** — all verbatim.
  `%packages` body → `groups` (`@…`, `@^…`) + `individual`, preserving excludes (`-pkg`). Handlers may emit
  diagnostics (e.g. "static network missing ip").

### Autoinstall (`import/autoinstall/`)

- `parseAutoinstall.ts`: `fromYaml(text)` → drop `#cloud-config` + `autoinstall:` root → object. Map known
  keys: `version` (assert `===1`, else diagnostic), `locale`→language, `keyboard.layout/variant`, `timezone`,
  `identity`→network.hostname + primaryUser, `ssh`→install-server / allow-pw→sshHardening.passwordAuth /
  authorized-keys→primaryUser.sshKeys, `storage.layout.name`→scheme (lvm→autopart-lvm, direct→autopart-plain)
  + password→encryption, `storage.config`→rawAutoinstallStorage, `network.ethernets`→interfaces,
  `packages`→individual, `apt.primary[].uri`→aptMirror, `early/late-commands`→scripts, `user-data`→
  rawAutoinstallUserData, `shutdown`→dropped.
  Remainder rule (cleaner here): **deep-clone the parsed object, delete every path consumed, and whatever
  remains *is* `extraKeys`** — so `snaps:`, `oem:`, `kernel:`, unknown sub-keys all survive without
  enumerating them.

## Fidelity proof (`roundTrip.ts` + `utils/diff.ts`)

- `roundTrip(originalText, spec, format)` re-emits via the existing `emit`, then compares. A small pure LCS
  line-diff (`utils/diff.ts`, ~40 lines, no dependency) produces the display diff.
- Classify:
  - **`exact`** — normalized texts identical.
  - **`semantic`** — differences only comments / blank lines / flag-or-key ordering / equivalent spellings.
  - **`lossy`** — a real, non-cosmetic original line missing from the re-emit. Should be impossible if
    passthrough caught everything; if it fires, it surfaces as an **error** diagnostic — a caught bug, not a
    silent drop.
- The review panel renders the badge + "Mapped N settings · Preserved M verbatim" + the highlighted diff.

## Import UX

- `ImportPanel.tsx` — opened from `ProfileBar`. Paste `<textarea>` + file picker (`accept` covers
  `.cfg`/`.ks`/`user-data`/`*.yaml`/`text/plain`) + drag-drop. Auto-detect via `detectFormat`, with a manual
  format `<select>` override. On input → `importFile(text, override?)` → render `ImportReview` on success, or
  show the parse error.
- `ImportReview.tsx` — renders the `FidelityReport` (badge, counts, diff) + reuses `DiagnosticsList`.
  **Confirm** → `loadProfile(result.spec)` + success toast; **Cancel** → close, form untouched.
- `ProfileBar` gains an **"Import install file…"** action, distinct from the existing JSON-profile import
  (relabel that one **"Import profile (JSON)"** to remove ambiguity). No new store action — reuse `loadProfile`.
- i18n: new keys for the panel/review/labels across en/fr/de/it, under the existing key-parity gate.

## Testing

- `src/__fixtures__/importCorpus/` — realistic `ks.cfg` and `user-data` fixtures, including un-modeled
  constructs (`zerombr`, `%addon com_redhat_kdump`, `snaps:`, `oem:`), static networks, encrypted storage,
  users with ssh keys, package groups + excludes.
- **Round-trip property test** (per fixture): `importFile(text)` is `ok`; fidelity is `exact` or `semantic`
  (never `lossy`); asserted known directives/keys land in the right fields; asserted unknown ones land in
  passthrough.
- **Re-import idempotence**: `importFile(emit(importFile(text).spec)).spec` deep-equals `importFile(text).spec`.
- **Unit tests**: `flags.ts`, `detectFormat.ts`, `utils/diff.ts`, `deepMerge`.
- **Emit-merge tests**: each passthrough bucket re-emits correctly (extra commands block; unknown flags
  appended to the right line; extra sections after pre/post; extraKeys deep-merged with modeled keys winning).
- **Negative/edge**: malformed YAML → `{ ok: false, error }` + graceful toast; empty/garbage input; detector
  low-confidence path.
- Coverage: `engines/import/**` and `utils/diff.ts` fall under the existing ≥75% gate
  (`coverage.include` already covers `src/engines/**` and `src/utils/**`).

## Suggested build sequence (writing-plans will formalize)

1. **Model + emit-merge** — `passthrough` schema (backward-compatible) + the kickstart/autoinstall merge
   helpers + tests. No behavior change for existing specs.
2. **Fidelity core** — `utils/diff.ts` + `roundTrip.ts` + classification + tests.
3. **Autoinstall parser** — the easier one; proves the consume-and-keep-remainder pattern; corpus + round-trip
   tests.
4. **Kickstart parser** — tokenizer + flags + dispatch; corpus + round-trip tests.
5. **Import UX** — `ImportPanel` / `ImportReview`, `ProfileBar` wiring, i18n, app-level test.

Every phase keeps `typecheck`, `lint`, `test:run`, `build` green and engines ≥75% covered, matching the
existing project gates.
