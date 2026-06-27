# Round-trip Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse an existing `ks.cfg` / `user-data` back into an `InstallSpec` so users can load and edit files they already have, with a visible "nothing silently lost" guarantee.

**Architecture:** Pure `parse → InstallSpec` engines under `src/engines/import/`. Known constructs map to spec fields; everything un-modeled is preserved verbatim in typed `passthrough` buckets (the consume-and-keep-remainder rule). Re-emit via the existing `emit()` and diff against the original to classify fidelity. UI is a Panel → review → confirm flow that reuses the store's existing `loadProfile`.

**Tech Stack:** TypeScript (strict), Zod 4, the `yaml` library (eemeli), Vitest 4, React 19, Tailwind v4, react-i18next, Biome 2.5.1.

## Global Constraints

- **Code style (Biome):** single quotes, `semicolons: asNeeded` (omit semicolons), `lineWidth: 100`, 2-space indent. `noConsole`/`noUnusedImports`/`noUnusedVariables` are errors. Run `npx biome check --write .` before each commit; it may reorder imports.
- **TypeScript strict:** `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type` for type-only imports), `exactOptionalPropertyTypes`. No `any`; prefer `unknown` + narrowing.
- **Purity:** everything under `src/engines/**` is pure — no React, no DOM, no `fetch`, no `Date.now()`/`Math.random()`. Same input → same output.
- **Single source of truth:** the only spec type is `InstallSpec` (from `@engines/model`). No parallel types.
- **Coverage gate:** `coverage.include` already covers `src/engines/**` and `src/utils/**`; keep them ≥75% (statements/branches/functions/lines). New files there must ship with tests.
- **Per-task green bar:** every task ends green on `npx tsc --noEmit && npx biome check . && npx vitest run`.
- **i18n:** four locales `en/fr/de/it`, single namespace `common`; the `keyParity.test.ts` gate requires identical key sets across all four.
- **Commits:** small and frequent, conventional-commit style (`feat:`, `test:`, `refactor:`). Do not push unless asked.

## Shared Interfaces (defined across tasks — exact names/types)

```ts
// src/engines/model/installSpec.ts (Task 1) — addition to InstallSpec
passthrough: {
  kickstart: {
    extraCommands: string[]
    unknownFlags: { command: string; index: number; flags: string[] }[]
    extraSections: { header: string; body: string }[]
    rawStorage: string[]
    // constant-directive slots + section headers, captured only when they differ from the emitter default
    constantLines: Record<string, string>   // slot ('mode'|'bootloader'|'services'|'firstboot'|'power') → verbatim line
    packagesHeader: string                   // default '%packages'
    preHeader: string                        // default '%pre --log=/var/log/ks-pre.log'
    postHeader: string                       // default '%post --log=/var/log/ks-post.log'
  }
  autoinstall: { extraKeys: Record<string, unknown> }
}

// src/utils/deepMerge.ts (Task 2)
type Json = Record<string, unknown>
function deepMerge(winner: Json, loser: Json): Json   // winner precedence; objects recurse; array/primitive → winner replaces

// src/utils/diff.ts (Task 6)
type DiffLine = { tag: 'same' | 'add' | 'del'; text: string }
function diffLines(a: string, b: string): DiffLine[]   // LCS; >1000 lines either side → positional fallback

// src/engines/import/detectFormat.ts (Task 5)
type Detection = { format: TargetFormat; confidence: number }   // confidence 0..1
function detectFormat(text: string): Detection

// src/engines/import/types.ts (Task 5)
type Fidelity = 'exact' | 'semantic' | 'lossy'
type ParseResult = { spec: InstallSpec; diagnostics: Diagnostic[]; mappedCount: number; passthroughCount: number }
type RoundTripResult = { fidelity: Fidelity; diff: DiffLine[] }
type FidelityReport = RoundTripResult & { mappedCount: number; passthroughCount: number }
type ImportResult =
  | { ok: true; spec: InstallSpec; report: FidelityReport; diagnostics: Diagnostic[] }
  | { ok: false; error: string }

// src/engines/import/kickstart/flags.ts (Task 8)
type Flag = { key: string; value: string | null; raw: string }   // key has no leading dashes; bare flag → value null
function parseFlags(args: string): { flags: Flag[]; positionals: string[] }

// src/engines/import/kickstart/tokenize.ts (Task 9)
type KsNode =
  | { kind: 'command'; name: string; args: string; index: number; raw: string }
  | { kind: 'section'; header: string; body: string }
  | { kind: 'comment'; raw: string }
  | { kind: 'blank' }
function tokenizeKickstart(text: string): KsNode[]

// src/engines/import/kickstart/parseKickstart.ts (Task 10)
function parseKickstart(text: string): ParseResult

// src/engines/import/autoinstall/parseAutoinstall.ts (Task 11)
function parseAutoinstall(text: string): ParseResult   // throws on malformed YAML

// src/engines/import/importFile.ts (Task 12)
function importFile(text: string, override?: TargetFormat): ImportResult
```

---

## Task 1: Passthrough model field

**Files:**
- Modify: `src/engines/model/installSpec.ts`
- Test: `src/engines/model/passthrough.test.ts`

**Interfaces:**
- Produces: `InstallSpec['passthrough']` (shape in Shared Interfaces). Backward-compatible: defaults to all-empty.

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/model/passthrough.test.ts
import { describe, expect, it } from 'vitest'
import { freshDefaultSpec } from './defaults'
import { InstallSpecSchema } from './installSpec'

describe('passthrough field', () => {
  it('defaults to empty buckets on a fresh spec', () => {
    const p = freshDefaultSpec().passthrough
    expect(p.kickstart.extraCommands).toEqual([])
    expect(p.kickstart.unknownFlags).toEqual([])
    expect(p.kickstart.extraSections).toEqual([])
    expect(p.kickstart.rawStorage).toEqual([])
    expect(p.autoinstall.extraKeys).toEqual({})
  })

  it('parses an old profile that has no passthrough key (backward compatible)', () => {
    const old = { ...freshDefaultSpec() } as Record<string, unknown>
    delete old.passthrough
    const parsed = InstallSpecSchema.safeParse(old)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.passthrough.kickstart.rawStorage).toEqual([])
  })

  it('round-trips unknownFlags with an occurrence index', () => {
    const spec = freshDefaultSpec()
    spec.passthrough.kickstart.unknownFlags.push({ command: 'network', index: 1, flags: ['--bindto=mac'] })
    const parsed = InstallSpecSchema.parse(spec)
    expect(parsed.passthrough.kickstart.unknownFlags[0]).toEqual({
      command: 'network',
      index: 1,
      flags: ['--bindto=mac'],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/model/passthrough.test.ts`
Expected: FAIL — `passthrough` is undefined.

- [ ] **Step 3: Add the schema**

Insert the `Passthrough` schema after the `Scripts` schema block (before `const Meta`):

```ts
const Passthrough = z.object({
  kickstart: z
    .object({
      extraCommands: z.array(z.string()).default([]),
      // index = the 0-based occurrence of `command` in the file, so re-emit appends to the right line
      unknownFlags: z
        .array(
          z.object({ command: z.string(), index: z.number().int().min(0), flags: z.array(z.string()) }),
        )
        .default([]),
      extraSections: z.array(z.object({ header: z.string(), body: z.string() })).default([]),
      // all-or-nothing storage: verbatim partitioning lines that REPLACE engine storage output
      rawStorage: z.array(z.string()).default([]),
      // constant-directive slots ('mode'|'bootloader'|'services'|'firstboot'|'power'), captured
      // only when the raw line differs from the emitter default (so minimal files stay idempotent)
      constantLines: z.record(z.string(), z.string()).default({}),
      // %packages/%pre/%post header lines (carry their flags verbatim)
      packagesHeader: z.string().default('%packages'),
      preHeader: z.string().default('%pre --log=/var/log/ks-pre.log'),
      postHeader: z.string().default('%post --log=/var/log/ks-post.log'),
    })
    .prefault({}),
  autoinstall: z
    .object({
      extraKeys: z.record(z.string(), z.unknown()).default({}),
    })
    .prefault({}),
}).prefault({})
```

Then add the field to `InstallSpecSchema` (after `meta: Meta,`):

```ts
  meta: Meta,
  passthrough: Passthrough,
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engines/model/passthrough.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/model/
git add src/engines/model/installSpec.ts src/engines/model/passthrough.test.ts
git commit -m "feat(model): add backward-compatible passthrough buckets"
```

---

## Task 2: `deepMerge` utility

**Files:**
- Create: `src/utils/deepMerge.ts`
- Test: `src/utils/deepMerge.test.ts`

**Interfaces:**
- Produces: `deepMerge(winner, loser)` — winner precedence; two plain objects merge recursively; any array/primitive on either side means winner replaces (no array concat).

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/deepMerge.test.ts
import { describe, expect, it } from 'vitest'
import { deepMerge } from './deepMerge'

describe('deepMerge', () => {
  it('recurses on nested objects, keeping loser-only keys', () => {
    expect(deepMerge({ a: { x: 1 } }, { a: { y: 2 }, b: 3 })).toEqual({ a: { x: 1, y: 2 }, b: 3 })
  })

  it('winner replaces on primitive conflict', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 1 })
  })

  it('winner array replaces loser array (no concatenation)', () => {
    expect(deepMerge({ cmds: ['a'] }, { cmds: ['b', 'c'] })).toEqual({ cmds: ['a'] })
  })

  it('does not mutate inputs', () => {
    const w = { a: { x: 1 } }
    const l = { a: { y: 2 } }
    deepMerge(w, l)
    expect(w).toEqual({ a: { x: 1 } })
    expect(l).toEqual({ a: { y: 2 } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/deepMerge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/utils/deepMerge.ts
type Json = Record<string, unknown>

const isPlainObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Merge two plain objects with WINNER precedence. Two plain objects merge
 * recursively; for any other pairing (array or primitive on either side) the
 * winner's value replaces the loser's — never concatenates arrays. Pure.
 */
export function deepMerge(winner: Json, loser: Json): Json {
  const out: Json = { ...loser }
  for (const [key, wVal] of Object.entries(winner)) {
    const lVal = out[key]
    out[key] = isPlainObject(wVal) && isPlainObject(lVal) ? deepMerge(wVal, lVal) : wVal
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/deepMerge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/utils/
git add src/utils/deepMerge.ts src/utils/deepMerge.test.ts
git commit -m "feat(utils): add winner-precedence deepMerge"
```

---

## Task 3: Autoinstall emit merges `extraKeys`

**Files:**
- Modify: `src/engines/emit/autoinstall/emitAutoinstall.ts`
- Test: `src/engines/emit/autoinstall/emitAutoinstall.passthrough.test.ts`

**Interfaces:**
- Consumes: `deepMerge` (Task 2), `InstallSpec.passthrough.autoinstall.extraKeys` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/emit/autoinstall/emitAutoinstall.passthrough.test.ts
import { describe, expect, it } from 'vitest'
import { freshDefaultSpec } from '../../model'
import { fromYaml } from './yaml'
import { emitAutoinstall } from './emitAutoinstall'

const ai = (content: string) => (fromYaml(content.replace(/^#cloud-config\n/, '')) as { autoinstall: Record<string, unknown> }).autoinstall

describe('emitAutoinstall passthrough', () => {
  it('deep-merges unknown extraKeys while modeled keys win', () => {
    const spec = freshDefaultSpec()
    spec.target = { ...spec.target, osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' }
    spec.passthrough.autoinstall.extraKeys = {
      snaps: { install: [{ name: 'microk8s' }] },
      identity: { shell: '/bin/zsh' }, // sibling of modeled identity.hostname
    }
    const out = ai(emitAutoinstall(spec).files[0].content)
    expect(out.snaps).toEqual({ install: [{ name: 'microk8s' }] })
    const identity = out.identity as Record<string, unknown>
    expect(identity.shell).toBe('/bin/zsh')
    expect(identity.hostname).toBe(spec.network.hostname) // modeled value preserved
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/emit/autoinstall/emitAutoinstall.passthrough.test.ts`
Expected: FAIL — `snaps` undefined.

- [ ] **Step 3: Implement the merge**

In `emitAutoinstall.ts`, add the import at the top:

```ts
import { deepMerge } from '../../../utils/deepMerge'
```

Replace the final assembly (the `autoinstall.shutdown = 'reboot'` line through the `content` line) with:

```ts
  autoinstall.shutdown = 'reboot'

  const extraKeys = spec.passthrough.autoinstall.extraKeys
  const merged =
    Object.keys(extraKeys).length > 0 ? deepMerge(autoinstall, extraKeys) : autoinstall

  const stamp = spec.meta.buildStamp ? `# build-stamp: ${spec.meta.buildStamp}\n` : ''
  const content = `#cloud-config\n${stamp}${toYaml({ autoinstall: merged })}`
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engines/emit/autoinstall/ && npx tsc --noEmit`
Expected: PASS (existing autoinstall snapshots still green — empty extraKeys is a no-op).

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/emit/autoinstall/
git add src/engines/emit/autoinstall/
git commit -m "feat(emit): merge autoinstall extraKeys passthrough"
```

---

## Task 4: Kickstart emit merges passthrough buckets

**Files:**
- Create: `src/engines/emit/kickstart/passthrough.ts`
- Modify: `src/engines/emit/kickstart/emitKickstart.ts`
- Test: `src/engines/emit/kickstart/passthrough.test.ts`

**Interfaces:**
- Consumes: `InstallSpec.passthrough.kickstart` (Task 1).
- Produces: `applyUnknownFlags(commands: string[], unknownFlags): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/emit/kickstart/passthrough.test.ts
import { describe, expect, it } from 'vitest'
import { freshDefaultSpec } from '../../model'
import { emitKickstart } from './emitKickstart'
import { applyUnknownFlags } from './passthrough'

describe('applyUnknownFlags', () => {
  it('appends flags to the Nth occurrence of a command', () => {
    const cmds = ['network --device=eth0', 'network --device=eth1', 'text']
    const out = applyUnknownFlags(cmds, [{ command: 'network', index: 1, flags: ['--bindto=mac'] }])
    expect(out[0]).toBe('network --device=eth0')
    expect(out[1]).toBe('network --device=eth1 --bindto=mac')
  })
})

describe('emitKickstart passthrough', () => {
  it('rawStorage replaces engine storage and emits exactly one clearpart', () => {
    const spec = freshDefaultSpec()
    spec.passthrough.kickstart.rawStorage = [
      'clearpart --all --initlabel',
      'part /boot --size=1024',
      'volgroup vg00 pv.01',
    ]
    const content = emitKickstart(spec).files[0].content
    expect(content.match(/^clearpart/gm)?.length).toBe(1)
    expect(content).toContain('volgroup vg00 pv.01')
    expect(content).not.toContain('autopart') // engine storage suppressed
  })

  it('appends extraCommands and extraSections verbatim', () => {
    const spec = freshDefaultSpec()
    spec.passthrough.kickstart.extraCommands = ['zerombr', 'module --name=idm --stream=DL1']
    spec.passthrough.kickstart.extraSections = [{ header: '%addon com_redhat_kdump --enable', body: '' }]
    const content = emitKickstart(spec).files[0].content
    expect(content).toContain('zerombr')
    expect(content).toContain('module --name=idm --stream=DL1')
    expect(content).toContain('%addon com_redhat_kdump --enable')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/emit/kickstart/passthrough.test.ts`
Expected: FAIL — module not found / behaviour absent.

- [ ] **Step 3: Implement the helper file**

```ts
// src/engines/emit/kickstart/passthrough.ts
import type { InstallSpec } from '../../model/installSpec'

type UnknownFlags = InstallSpec['passthrough']['kickstart']['unknownFlags']
type ExtraSections = InstallSpec['passthrough']['kickstart']['extraSections']

const firstWord = (line: string): string => line.split(/\s+/)[0] ?? ''

/** Append each entry's flags to the entry.index-th line whose command matches. Pure. */
export function applyUnknownFlags(commands: string[], unknownFlags: UnknownFlags): string[] {
  const out = [...commands]
  for (const { command, index, flags } of unknownFlags) {
    let seen = -1
    for (let i = 0; i < out.length; i++) {
      if (firstWord(out[i] ?? '') === command && ++seen === index) {
        out[i] = `${out[i]} ${flags.join(' ')}`
        break
      }
    }
  }
  return out
}

/** Render extra %sections (header + optional body + %end) verbatim. Pure. */
export function extraSectionBlocks(sections: ExtraSections): string[] {
  return sections.flatMap(({ header, body }) =>
    body ? [header, body, '%end'] : [header, '%end'],
  )
}
```

- [ ] **Step 4: Wire into `emitKickstart.ts`**

Add imports:

```ts
import { applyUnknownFlags, extraSectionBlocks } from './passthrough'
```

Replace the `commands` assembly and the `content` assembly. The storage line uses `rawStorage` when present; `applyUnknownFlags` wraps the array; `extraCommands` and `extraSectionBlocks` are appended:

```ts
  const ks = spec.passthrough.kickstart
  const storage = ks.rawStorage.length > 0 ? ks.rawStorage : storageLines(spec)

  const commands = applyUnknownFlags(
    [
      'text',
      ...sourceLines(spec),
      ...localeLines(spec),
      ...networkLines(spec),
      ...identityLines(spec),
      ...storage,
      bootloaderLine(spec),
      ...securityLines(spec),
      ...ks.extraCommands,
      'firstboot --disable',
      'reboot',
    ],
    ks.unknownFlags,
  )
```

And extend the final `content` join to include the extra sections after `post`:

```ts
  const content = `${[
    ...header,
    ...commands,
    '',
    ...packagesBlock(spec),
    '',
    ...pre,
    ...post,
    ...extraSectionBlocks(ks.extraSections),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`
```

- [ ] **Step 5: Run tests + commit**

Run: `npx vitest run src/engines/emit/kickstart/ && npx tsc --noEmit`
Expected: PASS (existing kickstart snapshots unchanged — empty buckets are no-ops).

```bash
npx biome check --write src/engines/emit/kickstart/
git add src/engines/emit/kickstart/
git commit -m "feat(emit): merge kickstart passthrough (rawStorage, flags, commands, sections)"
```

---

## Task 5: Format detection + import types

**Files:**
- Create: `src/engines/import/detectFormat.ts`, `src/engines/import/types.ts`
- Test: `src/engines/import/detectFormat.test.ts`

**Interfaces:**
- Produces: `detectFormat(text): Detection`; the `import/types.ts` type aliases (Shared Interfaces).

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/import/detectFormat.test.ts
import { describe, expect, it } from 'vitest'
import { detectFormat } from './detectFormat'

describe('detectFormat', () => {
  it('detects autoinstall from #cloud-config', () => {
    expect(detectFormat('#cloud-config\nautoinstall:\n  version: 1\n').format).toBe('autoinstall')
  })

  it('detects autoinstall from a bare autoinstall: root', () => {
    expect(detectFormat('autoinstall:\n  version: 1\n').format).toBe('autoinstall')
  })

  it('detects kickstart from directives + %-sections', () => {
    expect(detectFormat('lang en_US.UTF-8\ntext\n%packages\n@core\n%end\n').format).toBe('kickstart')
  })

  it('reports low confidence on garbage', () => {
    expect(detectFormat('just some prose\nwith no markers').confidence).toBeLessThan(0.5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/import/detectFormat.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types + detector**

```ts
// src/engines/import/types.ts
import type { DiffLine } from '../../utils/diff'
import type { InstallSpec, TargetFormat } from '../model/installSpec'
import type { Diagnostic } from '../types'

export type Fidelity = 'exact' | 'semantic' | 'lossy'
export type Detection = { format: TargetFormat; confidence: number }
export type ParseResult = {
  spec: InstallSpec
  diagnostics: Diagnostic[]
  mappedCount: number
  passthroughCount: number
}
export type RoundTripResult = { fidelity: Fidelity; diff: DiffLine[] }
export type FidelityReport = RoundTripResult & { mappedCount: number; passthroughCount: number }
export type ImportResult =
  | { ok: true; spec: InstallSpec; report: FidelityReport; diagnostics: Diagnostic[] }
  | { ok: false; error: string }
```

```ts
// src/engines/import/detectFormat.ts
import type { Detection } from './types'

const AUTOINSTALL_MARKERS = [/^#cloud-config\b/m, /^autoinstall\s*:/m, /^\s*version\s*:\s*1\b/m]
const KICKSTART_MARKERS = [/^%(packages|pre|post|addon|end)\b/m, /^(lang|keyboard|rootpw|autopart|clearpart|bootloader|zerombr)\b/m]

const score = (text: string, markers: RegExp[]): number =>
  markers.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)

/** Sniff the file format. Confidence is the winning side's marker hit-rate. Pure. */
export function detectFormat(text: string): Detection {
  const ai = score(text, AUTOINSTALL_MARKERS)
  const ks = score(text, KICKSTART_MARKERS)
  if (ai >= ks) return { format: 'autoinstall', confidence: ai / AUTOINSTALL_MARKERS.length }
  return { format: 'kickstart', confidence: ks / KICKSTART_MARKERS.length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/import/detectFormat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/import/
git add src/engines/import/detectFormat.ts src/engines/import/types.ts src/engines/import/detectFormat.test.ts
git commit -m "feat(import): format detection + result types"
```

---

## Task 6: `diffLines` utility (LCS + cap)

**Files:**
- Create: `src/utils/diff.ts`
- Test: `src/utils/diff.test.ts`

**Interfaces:**
- Produces: `DiffLine`, `diffLines(a, b)` (Shared Interfaces).

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/diff.test.ts
import { describe, expect, it } from 'vitest'
import { diffLines } from './diff'

describe('diffLines', () => {
  it('marks identical text as all same', () => {
    expect(diffLines('a\nb', 'a\nb').every((d) => d.tag === 'same')).toBe(true)
  })

  it('marks a changed middle line as del + add', () => {
    const d = diffLines('a\nb\nc', 'a\nX\nc')
    expect(d).toContainEqual({ tag: 'del', text: 'b' })
    expect(d).toContainEqual({ tag: 'add', text: 'X' })
    expect(d.filter((x) => x.tag === 'same').map((x) => x.text)).toEqual(['a', 'c'])
  })

  it('falls back to positional diff above the line cap without throwing', () => {
    const big = Array.from({ length: 1100 }, (_, i) => `line ${i}`).join('\n')
    const d = diffLines(big, big)
    expect(d.length).toBe(1100)
    expect(d.every((x) => x.tag === 'same')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/utils/diff.ts
export type DiffLine = { tag: 'same' | 'add' | 'del'; text: string }

const LINE_CAP = 1000

/** Positional fallback for very large inputs: equal-by-index, else del+add. */
function positionalDiff(a: string[], b: string[]): DiffLine[] {
  const out: DiffLine[] = []
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]
    const y = b[i]
    if (x !== undefined && x === y) out.push({ tag: 'same', text: x })
    else {
      if (x !== undefined) out.push({ tag: 'del', text: x })
      if (y !== undefined) out.push({ tag: 'add', text: y })
    }
  }
  return out
}

/** Line-level diff via LCS. O(N×M); above LINE_CAP lines either side it degrades
 *  to a positional diff to keep the browser responsive. Pure. */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n')
  const B = b.split('\n')
  if (A.length > LINE_CAP || B.length > LINE_CAP) return positionalDiff(A, B)

  const n = A.length
  const m = B.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ tag: 'same', text: A[i] as string })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ tag: 'del', text: A[i] as string })
      i++
    } else {
      out.push({ tag: 'add', text: B[j] as string })
      j++
    }
  }
  while (i < n) out.push({ tag: 'del', text: A[i++] as string })
  while (j < m) out.push({ tag: 'add', text: B[j++] as string })
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/utils/diff.ts src/utils/diff.test.ts
git add src/utils/diff.ts src/utils/diff.test.ts
git commit -m "feat(utils): line-level LCS diff with large-input cap"
```

---

## Task 7: `roundTrip` fidelity classifier

**Files:**
- Create: `src/engines/import/roundTrip.ts`
- Test: `src/engines/import/roundTrip.test.ts`

**Interfaces:**
- Consumes: `emit` (`@engines/emit`), `diffLines` (Task 6).
- Produces: `roundTrip(originalText, spec, format): RoundTripResult`.

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/import/roundTrip.test.ts
import { describe, expect, it } from 'vitest'
import { emit } from '../emit'
import { freshDefaultSpec } from '../model'
import { roundTrip } from './roundTrip'

describe('roundTrip', () => {
  it('classifies an unchanged re-emit as exact', () => {
    const spec = freshDefaultSpec()
    const original = emit(spec, 'kickstart').files[0].content
    expect(roundTrip(original, spec, 'kickstart').fidelity).toBe('exact')
  })

  it('classifies comment-only differences as semantic', () => {
    const spec = freshDefaultSpec()
    const original = `# a hand-written comment\n${emit(spec, 'kickstart').files[0].content}`
    expect(roundTrip(original, spec, 'kickstart').fidelity).toBe('semantic')
  })

  it('classifies a dropped non-comment directive as lossy', () => {
    const spec = freshDefaultSpec()
    const original = `${emit(spec, 'kickstart').files[0].content}\nzerombr\n`
    expect(roundTrip(original, spec, 'kickstart').fidelity).toBe('lossy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/import/roundTrip.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engines/import/roundTrip.ts
import { diffLines } from '../../utils/diff'
import { emit } from '../emit'
import type { InstallSpec, TargetFormat } from '../model/installSpec'
import type { Fidelity, RoundTripResult } from './types'

/** A line that carries semantic meaning (not a comment or blank). */
const isCosmetic = (line: string): boolean => {
  const t = line.trim()
  return t === '' || t.startsWith('#')
}

const normalize = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => !isCosmetic(l))
    .sort() // order-insensitive semantic comparison

function classify(original: string, reemitted: string): Fidelity {
  const a = normalize(original)
  const b = new Set(normalize(reemitted))
  if (a.length === b.size && a.every((l) => b.has(l))) {
    // same multiset of semantic lines → exact iff raw texts match, else semantic
    return original.trim() === reemitted.trim() ? 'exact' : 'semantic'
  }
  // any semantic line in the original missing from the re-emit → lossy
  return a.every((l) => b.has(l)) ? 'semantic' : 'lossy'
}

/** Re-emit the imported spec and compare to the original to prove fidelity. Pure. */
export function roundTrip(
  originalText: string,
  spec: InstallSpec,
  format: TargetFormat,
): RoundTripResult {
  const reemitted = emit(spec, format).files[0]?.content ?? ''
  return { fidelity: classify(originalText, reemitted), diff: diffLines(originalText, reemitted) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/import/roundTrip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/import/roundTrip.ts src/engines/import/roundTrip.test.ts
git add src/engines/import/roundTrip.ts src/engines/import/roundTrip.test.ts
git commit -m "feat(import): roundTrip fidelity classifier"
```

---

## Task 8: Kickstart flag parser

**Files:**
- Create: `src/engines/import/kickstart/flags.ts`
- Test: `src/engines/import/kickstart/flags.test.ts`

**Interfaces:**
- Produces: `Flag`, `parseFlags(args)` (Shared Interfaces).

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/import/kickstart/flags.test.ts
import { describe, expect, it } from 'vitest'
import { parseFlags } from './flags'

describe('parseFlags', () => {
  it('parses --k=v, --k v, bare flags, and positionals', () => {
    const { flags, positionals } = parseFlags('--name=admin --groups wheel,kvm --plaintext root')
    expect(flags).toContainEqual({ key: 'name', value: 'admin', raw: '--name=admin' })
    expect(flags).toContainEqual({ key: 'groups', value: 'wheel,kvm', raw: '--groups wheel,kvm' })
    expect(flags).toContainEqual({ key: 'plaintext', value: null, raw: '--plaintext' })
    expect(positionals).toEqual(['root'])
  })

  it('respects quoted values', () => {
    const { flags } = parseFlags('--gecos="System Admin"')
    expect(flags).toContainEqual({ key: 'gecos', value: 'System Admin', raw: '--gecos="System Admin"' })
  })

  it('treats a leading positional (lang) correctly', () => {
    expect(parseFlags('en_US.UTF-8').positionals).toEqual(['en_US.UTF-8'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/import/kickstart/flags.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engines/import/kickstart/flags.ts
export type Flag = { key: string; value: string | null; raw: string }

const stripQuotes = (s: string): string =>
  (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) ? s.slice(1, -1) : s

/** Split on whitespace but keep quoted spans intact. */
function tokenize(args: string): string[] {
  return args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
}

/** Parse a Kickstart command's argument string into flags + positionals. Pure.
 *  `--k=v` → {key:'k', value:'v'}; `--k v` → consumes the next token as value;
 *  bare `--flag` → value null; non-dashed tokens are positionals. `raw` preserves
 *  the original spelling for verbatim re-emit. */
export function parseFlags(args: string): { flags: Flag[]; positionals: string[] } {
  const tokens = tokenize(args)
  const flags: Flag[] = []
  const positionals: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] as string
    if (!tok.startsWith('--')) {
      positionals.push(stripQuotes(tok))
      continue
    }
    const body = tok.slice(2)
    const eq = body.indexOf('=')
    if (eq >= 0) {
      flags.push({ key: body.slice(0, eq), value: stripQuotes(body.slice(eq + 1)), raw: tok })
      continue
    }
    const next = tokens[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.push({ key: body, value: stripQuotes(next), raw: `${tok} ${next}` })
      i++
    } else {
      flags.push({ key: body, value: null, raw: tok })
    }
  }
  return { flags, positionals }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/import/kickstart/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/import/kickstart/
git add src/engines/import/kickstart/flags.ts src/engines/import/kickstart/flags.test.ts
git commit -m "feat(import): kickstart flag parser"
```

---

## Task 9: Kickstart tokenizer

**Files:**
- Create: `src/engines/import/kickstart/tokenize.ts`
- Test: `src/engines/import/kickstart/tokenize.test.ts`

**Interfaces:**
- Produces: `KsNode`, `tokenizeKickstart(text)` (Shared Interfaces).

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/import/kickstart/tokenize.test.ts
import { describe, expect, it } from 'vitest'
import { tokenizeKickstart } from './tokenize'

describe('tokenizeKickstart', () => {
  it('joins trailing-backslash line continuations into one command', () => {
    const nodes = tokenizeKickstart('network --bootproto=static \\\n  --ip=10.0.0.5\n')
    const cmd = nodes.find((n) => n.kind === 'command')
    expect(cmd).toMatchObject({ kind: 'command', name: 'network', args: '--bootproto=static --ip=10.0.0.5' })
  })

  it('assigns per-command occurrence indices', () => {
    const nodes = tokenizeKickstart('network --device=eth0\nnetwork --device=eth1\n')
    const nets = nodes.filter((n) => n.kind === 'command' && n.name === 'network')
    expect(nets.map((n) => (n as { index: number }).index)).toEqual([0, 1])
  })

  it('captures a section body until %end', () => {
    const nodes = tokenizeKickstart('%packages\n@core\nvim\n%end\n')
    expect(nodes.find((n) => n.kind === 'section')).toMatchObject({
      kind: 'section',
      header: '%packages',
      body: '@core\nvim',
    })
  })

  it('classifies comments and blanks', () => {
    const nodes = tokenizeKickstart('# hello\n\nlang en_US.UTF-8\n')
    expect(nodes[0]).toEqual({ kind: 'comment', raw: '# hello' })
    expect(nodes[1]).toEqual({ kind: 'blank' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/import/kickstart/tokenize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engines/import/kickstart/tokenize.ts
export type KsNode =
  | { kind: 'command'; name: string; args: string; index: number; raw: string }
  | { kind: 'section'; header: string; body: string }
  | { kind: 'comment'; raw: string }
  | { kind: 'blank' }

const SECTION_RE = /^%(packages|pre|pre-install|post|addon|anaconda|onerror|traceback)\b/

/** Merge trailing-backslash continuations into single logical lines. */
function joinContinuations(text: string): string[] {
  const raw = text.split('\n')
  const out: string[] = []
  let acc: string | null = null
  for (const line of raw) {
    const cont = line.endsWith('\\')
    const piece = cont ? line.slice(0, -1).trimEnd() : line
    acc = acc === null ? piece : `${acc} ${piece.trim()}`
    if (!cont) {
      out.push(acc)
      acc = null
    }
  }
  if (acc !== null) out.push(acc)
  return out
}

/** Tokenize a Kickstart file into ordered nodes. Pure. Sections collect their
 *  body until %end; each command carries its 0-based per-command occurrence index. */
export function tokenizeKickstart(text: string): KsNode[] {
  const lines = joinContinuations(text)
  const nodes: KsNode[] = []
  const counts = new Map<string, number>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (SECTION_RE.test(line)) {
      const header = line.trim()
      const body: string[] = []
      i++
      while (i < lines.length && (lines[i] as string).trim() !== '%end') {
        body.push(lines[i] as string)
        i++
      }
      nodes.push({ kind: 'section', header, body: body.join('\n').trim() })
      continue
    }
    if (line.trim() === '') {
      nodes.push({ kind: 'blank' })
      continue
    }
    if (line.trimStart().startsWith('#')) {
      nodes.push({ kind: 'comment', raw: line })
      continue
    }
    const name = line.trim().split(/\s+/)[0] as string
    const args = line.trim().slice(name.length).trim()
    const index = counts.get(name) ?? 0
    counts.set(name, index + 1)
    nodes.push({ kind: 'command', name, args, index, raw: line.trim() })
  }
  return nodes
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/import/kickstart/tokenize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/import/kickstart/
git add src/engines/import/kickstart/tokenize.ts src/engines/import/kickstart/tokenize.test.ts
git commit -m "feat(import): kickstart tokenizer with continuations + occurrence index"
```

---

## Task 10: Kickstart parser

**Files:**
- Create: `src/engines/import/kickstart/parseKickstart.ts`
- Test: `src/engines/import/kickstart/parseKickstart.test.ts`

**Interfaces:**
- Consumes: `tokenizeKickstart` (Task 9), `parseFlags` (Task 8), `freshDefaultSpec` (`@engines/model`).
- Produces: `parseKickstart(text): ParseResult`.

**Design notes for the implementer:**
- Start from `freshDefaultSpec()` with `target.osFamily='rhel'`. Clear the seeded `packages` so imported packages don't mix with defaults: set `spec.packages.groups = []` and `spec.packages.individual = []` before mapping.
- **All-or-nothing storage:** scan command nodes first. If any of `part`/`logvol`/`volgroup`/`raid`/`btrfs` is present, OR an `autopart` carries a flag other than `--type`/`--encrypted`/`--passphrase`/`--nohome`, then push every `clearpart`/`part`/`logvol`/`volgroup`/`raid`/`btrfs` raw line into `rawStorage` (original order), set `scheme='manual'`, leave `partitions=[]`, and mark those nodes "consumed by storage" so the main loop skips them. Otherwise model `autopart`/`clearpart` normally.
- **Remainder rule:** a command with no handler → `extraCommands.push(node.raw)`. A handled command whose `parseFlags` produced a flag key the handler didn't consume → `unknownFlags.push({ command: name, index: node.index, flags: [unconsumed.raw] })`. A non-pre/post/packages section → `extraSections`. `%pre`/`%post` body → `rawKickstartPre/Post`.
- **Soft-fail:** validate candidate values against the relevant sub-schema; on failure keep the default and push a `warning`. Never throw on content.
- **Counts:** `mappedCount` = number of nodes that hit a handler; `passthroughCount` = extraCommands + unknownFlags + extraSections + (rawStorage.length ? 1 : 0).

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/import/kickstart/parseKickstart.test.ts
import { describe, expect, it } from 'vitest'
import { parseKickstart } from './parseKickstart'

const KS = `# sample
text
lang en_US.UTF-8
keyboard us
timezone Europe/Zurich --utc
network --bootproto=static --ip=10.0.0.5 --netmask=255.255.255.0 --device=eth0
rootpw --lock
selinux --enforcing
autopart --type=lvm
clearpart --all --initlabel
zerombr
%packages
@^minimal-environment
vim
-nano
%end
%post --log=/root/post.log
echo hi
%end
`

describe('parseKickstart', () => {
  it('maps known directives into the spec', () => {
    const { spec } = parseKickstart(KS)
    expect(spec.target.osFamily).toBe('rhel')
    expect(spec.locale.language).toBe('en_US.UTF-8')
    expect(spec.locale.timezone).toBe('Europe/Zurich')
    expect(spec.network.interfaces[0]).toMatchObject({ mode: 'static', ip: '10.0.0.5', prefix: 24, device: 'eth0' })
    expect(spec.identity.rootPolicy).toBe('locked')
    expect(spec.security.selinux).toBe('enforcing')
    expect(spec.storage.scheme).toBe('autopart-lvm')
    expect(spec.packages.groups).toContain('@^minimal-environment')
    expect(spec.packages.individual).toContain('vim')
  })

  it('routes an unknown command to extraCommands', () => {
    const { spec } = parseKickstart(KS)
    expect(spec.passthrough.kickstart.extraCommands).toContain('zerombr')
  })

  it('captures the %post body verbatim', () => {
    const { spec } = parseKickstart(KS)
    expect(spec.scripts.rawKickstartPost).toContain('echo hi')
  })

  it('applies the all-or-nothing storage rule for volgroup/logvol layouts', () => {
    const ks = `clearpart --all\npart /boot --fstype=xfs --size=1024\nvolgroup vg00 pv.01\nlogvol / --vgname=vg00 --size=8192 --name=root\n`
    const { spec } = parseKickstart(ks)
    expect(spec.storage.scheme).toBe('manual')
    expect(spec.storage.partitions).toEqual([])
    expect(spec.passthrough.kickstart.rawStorage).toEqual([
      'clearpart --all',
      'part /boot --fstype=xfs --size=1024',
      'volgroup vg00 pv.01',
      'logvol / --vgname=vg00 --size=8192 --name=root',
    ])
  })

  it('records an unknown flag on a known command with its occurrence index', () => {
    const ks = 'network --device=eth0\nnetwork --device=eth1 --bindto=mac\n'
    const { spec } = parseKickstart(ks)
    expect(spec.passthrough.kickstart.unknownFlags).toContainEqual({
      command: 'network',
      index: 1,
      flags: ['--bindto=mac'],
    })
  })

  it('soft-fails a bad value: keeps default + warns, does not throw', () => {
    const { spec, diagnostics } = parseKickstart('selinux --bogus-mode\n')
    expect(spec.security.selinux).toBe('enforcing') // default kept
    expect(diagnostics.some((d) => d.severity === 'warning' && d.field === 'security.selinux')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/import/kickstart/parseKickstart.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engines/import/kickstart/parseKickstart.ts
import { freshDefaultSpec, type InstallSpec } from '../../model'
import type { Diagnostic } from '../../types'
import type { ParseResult } from '../types'
import { type Flag, parseFlags } from './flags'
import { type KsNode, tokenizeKickstart } from './tokenize'

const STORAGE_CMDS = new Set(['clearpart', 'part', 'logvol', 'volgroup', 'raid', 'btrfs'])
const COMPLEX_STORAGE = new Set(['part', 'logvol', 'volgroup', 'raid', 'btrfs'])
const AUTOPART_KNOWN = new Set(['type', 'encrypted', 'passphrase', 'nohome'])
const SELINUX_MODES = new Set(['enforcing', 'permissive', 'disabled'])

const netmaskToPrefix = (mask: string): number => {
  const parts = mask.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return 24
  return parts.reduce((bits, octet) => bits + ((octet >>> 0).toString(2).match(/1/g)?.length ?? 0), 0)
}

const flagVal = (flags: Flag[], key: string): string | undefined =>
  flags.find((f) => f.key === key)?.value ?? undefined
const hasFlag = (flags: Flag[], key: string): boolean => flags.some((f) => f.key === key)

/** Parse a Kickstart file into an InstallSpec. Pure; never throws on content. */
export function parseKickstart(text: string): ParseResult {
  const spec = freshDefaultSpec()
  spec.target = { ...spec.target, osFamily: 'rhel', distro: 'rhel', version: '9' }
  spec.packages.groups = []
  spec.packages.individual = []
  const diagnostics: Diagnostic[] = []
  let mapped = 0

  const nodes = tokenizeKickstart(text)
  const commands = nodes.filter((n): n is Extract<KsNode, { kind: 'command' }> => n.kind === 'command')

  // --- storage: all-or-nothing decision ---
  const autopart = commands.find((c) => c.name === 'autopart')
  const autopartExtra =
    autopart !== undefined &&
    parseFlags(autopart.args).flags.some((f) => !AUTOPART_KNOWN.has(f.key))
  const hasComplex = commands.some((c) => COMPLEX_STORAGE.has(c.name)) || autopartExtra
  if (hasComplex) {
    for (const c of commands) if (STORAGE_CMDS.has(c.name)) spec.passthrough.kickstart.rawStorage.push(c.raw)
    spec.storage.scheme = 'manual'
    spec.storage.partitions = []
  }
  const consumedByStorage = (name: string): boolean =>
    hasComplex ? STORAGE_CMDS.has(name) : false

  const recordUnknownFlags = (cmd: string, index: number, unknown: Flag[]): void => {
    if (unknown.length > 0)
      spec.passthrough.kickstart.unknownFlags.push({ command: cmd, index, flags: unknown.map((f) => f.raw) })
  }

  for (const node of nodes) {
    if (node.kind === 'blank' || node.kind === 'comment') continue
    if (node.kind === 'section') {
      const header = node.header
      if (header.startsWith('%packages')) {
        for (const line of node.body.split('\n').map((l) => l.trim()).filter(Boolean)) {
          if (line.startsWith('@')) spec.packages.groups.push(line)
          else spec.packages.individual.push(line) // includes excludes like -nano, verbatim
        }
        mapped++
      } else if (header.startsWith('%pre')) {
        spec.scripts.rawKickstartPre = node.body
        mapped++
      } else if (header.startsWith('%post')) {
        spec.scripts.rawKickstartPost = node.body
        mapped++
      } else {
        spec.passthrough.kickstart.extraSections.push({ header, body: node.body })
      }
      continue
    }

    // command node
    const { name, args, index, raw } = node
    if (consumedByStorage(name)) continue
    const { flags, positionals } = parseFlags(args)

    switch (name) {
      case 'text':
      case 'reboot':
      case 'poweroff':
      case 'shutdown':
      case 'firstboot':
      case 'cmdline':
      case 'graphical':
        mapped++ // emit constants — recognized and dropped
        break
      case 'lang':
        if (positionals[0]) spec.locale.language = positionals[0]
        mapped++
        break
      case 'keyboard':
        spec.locale.keyboard = flagVal(flags, 'vckeymap') ?? positionals[0] ?? spec.locale.keyboard
        recordUnknownFlags(name, index, flags.filter((f) => f.key !== 'vckeymap' && f.key !== 'xlayouts'))
        mapped++
        break
      case 'timezone':
        if (positionals[0]) spec.locale.timezone = positionals[0]
        spec.locale.utcHardwareClock = hasFlag(flags, 'utc')
        recordUnknownFlags(name, index, flags.filter((f) => f.key !== 'utc'))
        mapped++
        break
      case 'network': {
        const iface = {
          device: flagVal(flags, 'device') ?? 'link',
          mode: (flagVal(flags, 'bootproto') === 'static' ? 'static' : 'dhcp') as 'static' | 'dhcp',
          ip: flagVal(flags, 'ip') ?? '',
          prefix: flagVal(flags, 'netmask') ? netmaskToPrefix(flagVal(flags, 'netmask') as string) : 24,
          gateway: flagVal(flags, 'gateway') ?? '',
          nameservers: flagVal(flags, 'nameserver') ? [flagVal(flags, 'nameserver') as string] : [],
        }
        if (index === 0) spec.network.interfaces = [iface]
        else spec.network.interfaces.push(iface)
        const host = flagVal(flags, 'hostname')
        if (host) spec.network.hostname = host
        recordUnknownFlags(
          name,
          index,
          flags.filter((f) => !['device', 'bootproto', 'ip', 'netmask', 'gateway', 'nameserver', 'hostname', 'activate'].includes(f.key)),
        )
        mapped++
        break
      }
      case 'rootpw':
        if (hasFlag(flags, 'lock')) spec.identity.rootPolicy = 'locked'
        else if (hasFlag(flags, 'iscrypted')) {
          spec.identity.rootPolicy = 'password'
          spec.identity.rootPasswordCrypt = positionals[0] ?? ''
        }
        mapped++
        break
      case 'selinux': {
        const mode = ['enforcing', 'permissive', 'disabled'].find((m) => hasFlag(flags, m))
        if (mode && SELINUX_MODES.has(mode)) spec.security.selinux = mode as InstallSpec['security']['selinux']
        else
          diagnostics.push({
            severity: 'warning',
            field: 'security.selinux',
            message: `Unrecognized selinux mode in "${raw}"; kept default "${spec.security.selinux}".`,
          })
        mapped++
        break
      }
      case 'firewall':
        spec.security.firewall.enabled = !hasFlag(flags, 'disabled')
        mapped++
        break
      case 'autopart':
        spec.storage.scheme = flagVal(flags, 'type') === 'plain' ? 'autopart-plain' : 'autopart-lvm'
        if (hasFlag(flags, 'encrypted')) {
          spec.storage.encryption.enabled = true
          spec.storage.encryption.passphrase = flagVal(flags, 'passphrase') ?? ''
        }
        mapped++
        break
      case 'clearpart':
        spec.storage.wipe = hasFlag(flags, 'all') || hasFlag(flags, 'linux')
        mapped++
        break
      case 'url':
        spec.packages.installUrl = flagVal(flags, 'url') ?? spec.packages.installUrl
        mapped++
        break
      default:
        spec.passthrough.kickstart.extraCommands.push(raw)
    }
  }

  const pk = spec.passthrough.kickstart
  const passthroughCount =
    pk.extraCommands.length + pk.unknownFlags.length + pk.extraSections.length + (pk.rawStorage.length > 0 ? 1 : 0)
  return { spec, diagnostics, mappedCount: mapped, passthroughCount }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/import/kickstart/parseKickstart.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/import/kickstart/
git add src/engines/import/kickstart/parseKickstart.ts src/engines/import/kickstart/parseKickstart.test.ts
git commit -m "feat(import): kickstart parser with all-or-nothing storage + remainder rule"
```

---

## Task 11: Autoinstall parser

**Files:**
- Create: `src/engines/import/autoinstall/parseAutoinstall.ts`
- Test: `src/engines/import/autoinstall/parseAutoinstall.test.ts`

**Interfaces:**
- Consumes: `fromYaml` (`../emit/autoinstall/yaml`), `freshDefaultSpec`.
- Produces: `parseAutoinstall(text): ParseResult` (throws only on malformed YAML).

**Design notes:**
- `fromYaml` may throw → let it propagate; `importFile` (Task 12) catches it for the hard-fail path.
- Build `extraKeys` by deep-cloning the parsed `autoinstall` object and **deleting only consumed leaves** (helper `deleteLeaf(obj, path)` that prunes a parent once it is emptied).
- Soft-fail per field as in Kickstart.

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/import/autoinstall/parseAutoinstall.test.ts
import { describe, expect, it } from 'vitest'
import { parseAutoinstall } from './parseAutoinstall'

const UD = `#cloud-config
autoinstall:
  version: 1
  locale: en_US.UTF-8
  keyboard:
    layout: ch
    variant: fr
  timezone: Europe/Zurich
  identity:
    hostname: web01
    username: admin
    shell: /bin/zsh
  ssh:
    install-server: true
    allow-pw: false
    authorized-keys:
      - ssh-ed25519 AAAA admin@host
  storage:
    layout:
      name: lvm
  packages:
    - vim
  snaps:
    install:
      - name: microk8s
  shutdown: reboot
`

describe('parseAutoinstall', () => {
  it('maps known keys into the spec', () => {
    const { spec } = parseAutoinstall(UD)
    expect(spec.target.osFamily).toBe('ubuntu')
    expect(spec.locale.language).toBe('en_US.UTF-8')
    expect(spec.locale.keyboard).toBe('ch')
    expect(spec.locale.keyboardVariant).toBe('fr')
    expect(spec.network.hostname).toBe('web01')
    expect(spec.identity.primaryUser.name).toBe('admin')
    expect(spec.identity.primaryUser.sshKeys).toContain('ssh-ed25519 AAAA admin@host')
    expect(spec.storage.scheme).toBe('autopart-lvm')
    expect(spec.packages.individual).toContain('vim')
  })

  it('keeps unknown keys and unmodeled siblings in extraKeys (leaf-level)', () => {
    const { spec } = parseAutoinstall(UD)
    const extra = spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    expect(extra.snaps).toEqual({ install: [{ name: 'microk8s' }] })
    expect((extra.identity as Record<string, unknown>).shell).toBe('/bin/zsh')
    expect((extra.identity as Record<string, unknown>).username).toBeUndefined() // consumed leaf removed
  })

  it('warns on version !== 1 but still imports', () => {
    const { diagnostics } = parseAutoinstall('#cloud-config\nautoinstall:\n  version: 2\n')
    expect(diagnostics.some((d) => d.field === 'version')).toBe(true)
  })

  it('throws on malformed YAML', () => {
    expect(() => parseAutoinstall('#cloud-config\nautoinstall:\n  : : :\n')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/import/autoinstall/parseAutoinstall.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engines/import/autoinstall/parseAutoinstall.ts
import { fromYaml } from '../../emit/autoinstall/yaml'
import { freshDefaultSpec } from '../../model'
import type { Diagnostic } from '../../types'
import type { ParseResult } from '../types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Delete a nested leaf by path, pruning parent objects that become empty. */
function deleteLeaf(root: Obj, path: string[]): void {
  const [head, ...rest] = path
  if (head === undefined) return
  if (rest.length === 0) {
    delete root[head]
    return
  }
  const child = root[head]
  if (isObj(child)) {
    deleteLeaf(child, rest)
    if (Object.keys(child).length === 0) delete root[head]
  }
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Parse an Autoinstall user-data file into an InstallSpec. Throws only on
 *  malformed YAML; all content problems become warnings. Pure otherwise. */
export function parseAutoinstall(text: string): ParseResult {
  const doc = fromYaml(text.replace(/^#cloud-config\s*\n/, ''))
  const ai = isObj(doc) && isObj(doc.autoinstall) ? doc.autoinstall : isObj(doc) ? doc : {}

  const spec = freshDefaultSpec()
  spec.target = { ...spec.target, osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' }
  spec.packages.groups = []
  spec.packages.individual = []
  const diagnostics: Diagnostic[] = []
  const extra = structuredClone(ai) as Obj
  const consume = (...path: string[]): void => deleteLeaf(extra, path)
  let mapped = 0

  if ('version' in ai) {
    if (ai.version !== 1)
      diagnostics.push({ severity: 'warning', field: 'version', message: `autoinstall version ${String(ai.version)} (expected 1); imported anyway.` })
    consume('version')
    mapped++
  }
  const locale = asString(ai.locale)
  if (locale) { spec.locale.language = locale; consume('locale'); mapped++ }
  if (isObj(ai.keyboard)) {
    if (asString(ai.keyboard.layout)) spec.locale.keyboard = asString(ai.keyboard.layout) as string
    if (asString(ai.keyboard.variant)) spec.locale.keyboardVariant = asString(ai.keyboard.variant) as string
    consume('keyboard', 'layout'); consume('keyboard', 'variant'); mapped++
  }
  if (asString(ai.timezone)) { spec.locale.timezone = asString(ai.timezone) as string; consume('timezone'); mapped++ }
  if (isObj(ai.identity)) {
    const id = ai.identity
    if (asString(id.hostname)) { spec.network.hostname = asString(id.hostname) as string; consume('identity', 'hostname') }
    if (asString(id.username)) { spec.identity.primaryUser.name = asString(id.username) as string; consume('identity', 'username') }
    if (asString(id.realname)) { spec.identity.primaryUser.gecos = asString(id.realname) as string; consume('identity', 'realname') }
    if (asString(id.password)) { spec.identity.primaryUser.passwordMode = 'hashed'; spec.identity.primaryUser.passwordCrypt = asString(id.password) as string; consume('identity', 'password') }
    mapped++
  }
  if (isObj(ai.ssh)) {
    spec.security.sshHardening.passwordAuth = ai.ssh['allow-pw'] === true
    const keys = ai.ssh['authorized-keys']
    if (Array.isArray(keys)) spec.identity.primaryUser.sshKeys = keys.filter((k): k is string => typeof k === 'string')
    consume('ssh', 'install-server'); consume('ssh', 'allow-pw'); consume('ssh', 'authorized-keys'); mapped++
  }
  if (isObj(ai.storage) && isObj(ai.storage.layout)) {
    spec.storage.scheme = ai.storage.layout.name === 'direct' ? 'autopart-plain' : 'autopart-lvm'
    if (asString(ai.storage.layout.password)) { spec.storage.encryption.enabled = true; spec.storage.encryption.passphrase = asString(ai.storage.layout.password) as string }
    consume('storage', 'layout'); mapped++
  }
  if (Array.isArray(ai.packages)) {
    spec.packages.individual = ai.packages.filter((p): p is string => typeof p === 'string')
    consume('packages'); mapped++
  }
  for (const key of ['early-commands', 'late-commands'] as const) {
    const cmds = ai[key]
    if (Array.isArray(cmds)) {
      const list = cmds.filter((c): c is string => typeof c === 'string')
      if (key === 'early-commands') spec.scripts.earlyCommands = list
      else spec.scripts.lateCommands = list
      consume(key); mapped++
    }
  }
  if ('shutdown' in ai) { consume('shutdown'); mapped++ }

  spec.passthrough.autoinstall.extraKeys = extra
  const passthroughCount = Object.keys(extra).length
  return { spec, diagnostics, mappedCount: mapped, passthroughCount }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/import/autoinstall/parseAutoinstall.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/import/autoinstall/
git add src/engines/import/autoinstall/parseAutoinstall.ts src/engines/import/autoinstall/parseAutoinstall.test.ts
git commit -m "feat(import): autoinstall parser with leaf-level remainder"
```

---

## Task 12: `importFile` orchestrator + barrel

**Files:**
- Create: `src/engines/import/importFile.ts`, `src/engines/import/index.ts`
- Test: `src/engines/import/importFile.test.ts`

**Interfaces:**
- Consumes: `detectFormat`, `parseKickstart`, `parseAutoinstall`, `roundTrip`, `InstallSpecSchema`.
- Produces: `importFile(text, override?): ImportResult` and the public barrel.

- [ ] **Step 1: Write the failing test**

```ts
// src/engines/import/importFile.test.ts
import { describe, expect, it } from 'vitest'
import { emit } from '../emit'
import { freshDefaultSpec } from '../model'
import { importFile } from './importFile'

describe('importFile', () => {
  it('imports a kickstart file end to end', () => {
    const spec = freshDefaultSpec()
    const original = emit(spec, 'kickstart').files[0].content
    const res = importFile(original)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.spec.target.osFamily).toBe('rhel')
      expect(res.report.fidelity).not.toBe('lossy')
    }
  })

  it('imports an autoinstall file end to end', () => {
    const spec = freshDefaultSpec()
    spec.target = { ...spec.target, osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' }
    const original = emit(spec, 'autoinstall').files[0].content
    const res = importFile(original)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.spec.target.osFamily).toBe('ubuntu')
  })

  it('is idempotent: re-importing the emit of an import yields the same spec', () => {
    const start = freshDefaultSpec()
    const original = emit(start, 'kickstart').files[0].content
    const first = importFile(original)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = importFile(emit(first.spec, 'kickstart').files[0].content)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.spec).toEqual(first.spec)
  })

  it('hard-fails on malformed YAML autoinstall', () => {
    const res = importFile('#cloud-config\nautoinstall:\n  : : :\n')
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/import/importFile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engines/import/importFile.ts
import { InstallSpecSchema, type TargetFormat } from '../model'
import { parseAutoinstall } from './autoinstall/parseAutoinstall'
import { detectFormat } from './detectFormat'
import { parseKickstart } from './kickstart/parseKickstart'
import { roundTrip } from './roundTrip'
import type { ImportResult, ParseResult } from './types'

/** Parse a native install file back into an InstallSpec, with a fidelity report.
 *  Pure. Hard-fails only on unparseable structure; content issues become warnings. */
export function importFile(text: string, override?: TargetFormat): ImportResult {
  if (text.trim() === '') return { ok: false, error: 'Empty input.' }
  const detected = override ?? detectFormat(text).format

  let parsed: ParseResult
  try {
    parsed = detected === 'autoinstall' ? parseAutoinstall(text) : parseKickstart(text)
  } catch (e) {
    return { ok: false, error: `Could not parse ${detected} file: ${(e as Error).message}` }
  }

  // Backstop: handlers only write valid values, so this should always pass.
  const validated = InstallSpecSchema.safeParse(parsed.spec)
  if (!validated.success) {
    return { ok: false, error: `Parsed spec failed validation: ${validated.error.issues[0]?.message ?? 'unknown'}` }
  }

  const rt = roundTrip(text, validated.data, detected)
  return {
    ok: true,
    spec: validated.data,
    diagnostics: parsed.diagnostics,
    report: { ...rt, mappedCount: parsed.mappedCount, passthroughCount: parsed.passthroughCount },
  }
}
```

```ts
// src/engines/import/index.ts
export { detectFormat } from './detectFormat'
export { importFile } from './importFile'
export type { Detection, FidelityReport, ImportResult, ParseResult, RoundTripResult } from './types'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/import/ && npx tsc --noEmit`
Expected: PASS — including the idempotence test.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/engines/import/
git add src/engines/import/importFile.ts src/engines/import/index.ts src/engines/import/importFile.test.ts
git commit -m "feat(import): importFile orchestrator + public barrel"
```

---

## Task 13: Import corpus + round-trip property tests

**Files:**
- Create: `src/__fixtures__/importCorpus/rhel-complex.ks`, `src/__fixtures__/importCorpus/ubuntu-complex.user-data`
- Test: `src/engines/import/corpus.test.ts`

**Interfaces:**
- Consumes: `importFile`, `emit`. Uses Vitest `import.meta.glob` to load fixtures as raw text.

- [ ] **Step 1: Add the fixtures**

```kickstart
# src/__fixtures__/importCorpus/rhel-complex.ks
# complex RHEL kickstart with un-modeled constructs
text
lang en_US.UTF-8
keyboard us
timezone Europe/Zurich --utc
zerombr
network --bootproto=static --ip=10.0.0.5 --netmask=255.255.255.0 --gateway=10.0.0.1 --device=eth0
network --bootproto=dhcp --device=eth1 --bindto=mac
rootpw --iscrypted $6$abc$def
selinux --enforcing
firewall --enabled --service=ssh
clearpart --all --initlabel
part /boot --fstype=xfs --size=1024
volgroup vg00 pv.01
logvol / --vgname=vg00 --name=root --size=8192
bootloader --location=mbr
module --name=idm --stream=DL1
%packages
@^minimal-environment
vim
-nano
%end
%post --log=/root/post.log
echo configured
%end
%addon com_redhat_kdump --enable --reserve-mb=auto
%end
```

```yaml
# src/__fixtures__/importCorpus/ubuntu-complex.user-data
#cloud-config
autoinstall:
  version: 1
  locale: en_US.UTF-8
  keyboard:
    layout: ch
    variant: fr
  timezone: Europe/Zurich
  identity:
    hostname: web01
    username: admin
    password: $6$abc$def
    shell: /bin/zsh
  ssh:
    install-server: true
    allow-pw: false
    authorized-keys:
      - ssh-ed25519 AAAA admin@host
  storage:
    layout:
      name: lvm
  packages:
    - vim
  snaps:
    install:
      - name: microk8s
  oem:
    install: auto
  late-commands:
    - curtin in-target -- systemctl enable foo
  shutdown: reboot
```

- [ ] **Step 2: Write the failing property test**

```ts
// src/engines/import/corpus.test.ts
import { describe, expect, it } from 'vitest'
import type { TargetFormat } from '../model'
import { emit } from '../emit'
import { importFile } from './importFile'

const files = import.meta.glob('../../__fixtures__/importCorpus/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const cases = Object.entries(files).map(([path, content]) => ({
  name: path.split('/').pop() as string,
  content,
  format: (path.endsWith('.ks') ? 'kickstart' : 'autoinstall') as TargetFormat,
}))

describe('import corpus round-trip', () => {
  it.each(cases)('imports $name without loss', ({ content }) => {
    const res = importFile(content)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.report.fidelity).not.toBe('lossy')
  })

  it.each(cases)('$name is idempotent across a second round trip', ({ content, format }) => {
    const first = importFile(content)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = importFile(emit(first.spec, format).files[0].content)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.spec).toEqual(first.spec)
  })

  it('preserves un-modeled kickstart constructs verbatim', () => {
    const ks = cases.find((c) => c.name === 'rhel-complex.ks')
    if (!ks) throw new Error('fixture missing')
    const res = importFile(ks.content)
    if (!res.ok) throw new Error('expected ok')
    const pk = res.spec.passthrough.kickstart
    expect(pk.extraCommands).toContain('zerombr')
    expect(pk.extraCommands.some((c) => c.startsWith('module --name=idm'))).toBe(true)
    expect(pk.rawStorage.some((l) => l.startsWith('volgroup'))).toBe(true)
    expect(pk.extraSections.some((s) => s.header.startsWith('%addon'))).toBe(true)
    expect(pk.unknownFlags).toContainEqual({ command: 'network', index: 1, flags: ['--bindto=mac'] })
  })

  it('preserves un-modeled autoinstall keys verbatim', () => {
    const ud = cases.find((c) => c.name === 'ubuntu-complex.user-data')
    if (!ud) throw new Error('fixture missing')
    const res = importFile(ud.content)
    if (!res.ok) throw new Error('expected ok')
    const extra = res.spec.passthrough.autoinstall.extraKeys as Record<string, unknown>
    expect(extra.snaps).toBeDefined()
    expect(extra.oem).toBeDefined()
    expect((extra.identity as Record<string, unknown>).shell).toBe('/bin/zsh')
  })
})
```

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `npx vitest run src/engines/import/corpus.test.ts`
Expected: FAIL first if any handler is incomplete. Fix handlers in `parseKickstart`/`parseAutoinstall` until green. If a fixture line legitimately can't round-trip, that is the design working — adjust the handler or confirm it lands in passthrough; never weaken the assertion to hide a loss.

- [ ] **Step 4: Confirm the whole suite is green**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx biome check --write src/
git add src/__fixtures__/importCorpus/ src/engines/import/corpus.test.ts
git commit -m "test(import): corpus round-trip + idempotence property tests"
```

---

## Task 14: Import UI — Panel + Review

**Files:**
- Create: `src/components/import/ImportPanel.tsx`, `src/components/import/ImportReview.tsx`
- Test: `src/components/import/ImportPanel.test.tsx`

**Interfaces:**
- Consumes: `importFile`, `ImportResult` (`@engines/import`), `loadProfile` (store), `DiagnosticsList`.
- `@engines/import` alias resolves to `src/engines/import` (matches the existing `@engines/*` aliases).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/import/ImportPanel.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useGeneratorStore } from '@store/generatorStore'
import { ImportPanel } from './ImportPanel'

describe('ImportPanel', () => {
  it('parses pasted kickstart text and confirms into the store', () => {
    render(<ImportPanel onClose={() => {}} />)
    const ks = 'text\nlang fr_FR.UTF-8\nselinux --permissive\n'
    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: ks } })
    fireEvent.click(screen.getByRole('button', { name: /parse/i }))
    expect(screen.getByText(/mapped/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(useGeneratorStore.getState().spec.locale.language).toBe('fr_FR.UTF-8')
    expect(useGeneratorStore.getState().spec.security.selinux).toBe('permissive')
  })

  it('shows an error for empty input on parse', () => {
    render(<ImportPanel onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /parse/i }))
    expect(screen.getByText(/empty input/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/import/ImportPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ImportReview`**

```tsx
// src/components/import/ImportReview.tsx
import { DiagnosticsList } from '@components/DiagnosticsList'
import type { ImportResult } from '@engines/import'
import { useTranslation } from 'react-i18next'

type OkResult = Extract<ImportResult, { ok: true }>

const BADGE: Record<OkResult['report']['fidelity'], string> = {
  exact: 'bg-emerald-500',
  semantic: 'bg-amber-500',
  lossy: 'bg-rose-600',
}

export function ImportReview({ result, onConfirm, onCancel }: {
  result: OkResult
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { report, diagnostics } = result
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`rounded px-2 py-0.5 text-white ${BADGE[report.fidelity]}`}>{report.fidelity}</span>
        <span>{t('import.mapped', { count: report.mappedCount })} · {t('import.preserved', { count: report.passthroughCount })}</span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('import.verbatimNote')}</p>
      <pre className="code-pane max-h-72 overflow-auto text-xs">
        {report.diff.map((d, i) => (
          <div
            key={`${i}-${d.text}`}
            className={d.tag === 'add' ? 'text-emerald-500' : d.tag === 'del' ? 'text-rose-500' : ''}
          >
            {d.tag === 'add' ? '+ ' : d.tag === 'del' ? '- ' : '  '}{d.text}
          </div>
        ))}
      </pre>
      {diagnostics.length > 0 && <DiagnosticsList diagnostics={diagnostics} />}
      <div className="flex gap-2">
        <button type="button" className="btn-primary" onClick={onConfirm}>{t('import.confirm')}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>{t('import.cancel')}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `ImportPanel` and make tests pass**

```tsx
// src/components/import/ImportPanel.tsx
import { importFile, type ImportResult } from '@engines/import'
import { useGeneratorStore } from '@store/generatorStore'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ImportReview } from './ImportReview'

export function ImportPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const loadProfile = useGeneratorStore((s) => s.loadProfile)
  const [text, setText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const onParse = () => setResult(importFile(text))

  const onPickFile = async (file: File) => {
    const content = await file.text()
    setText(content)
    setResult(importFile(content))
  }

  const onConfirm = () => {
    if (result?.ok) {
      loadProfile(result.spec)
      toast.success(t('import.success'))
      onClose()
    }
  }

  return (
    <div className="panel flex flex-col gap-3">
      <textarea
        className="code-pane h-40 w-full"
        aria-label={t('import.paste')}
        placeholder={t('import.placeholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button type="button" className="btn-primary" onClick={onParse}>{t('import.parse')}</button>
        <label className="btn-ghost cursor-pointer">
          {t('import.chooseFile')}
          <input
            type="file"
            className="hidden"
            accept=".cfg,.ks,.yaml,.yml,user-data,text/plain"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = '' }}
          />
        </label>
        <button type="button" className="btn-ghost" onClick={onClose}>{t('import.close')}</button>
      </div>
      {result && !result.ok && <p className="text-sm text-rose-500">{result.error}</p>}
      {result?.ok && <ImportReview result={result} onConfirm={onConfirm} onCancel={() => setResult(null)} />}
    </div>
  )
}
```

> Note: confirm `DiagnosticsList` accepts a `diagnostics` prop. If its current prop name differs, match the existing signature (read `src/components/DiagnosticsList.tsx`) rather than changing the component.

- [ ] **Step 5: Run tests + commit**

Run: `npx vitest run src/components/import/ && npx tsc --noEmit`
Expected: PASS (after Task 15 adds the i18n keys, the text assertions resolve; if running this task in isolation, the keys render as raw ids which still satisfy the role/label queries — add Task 15 keys before asserting visible copy).

```bash
npx biome check --write src/components/import/
git add src/components/import/
git commit -m "feat(ui): import panel + review with fidelity diff"
```

---

## Task 15: Wire into ProfileBar + i18n

**Files:**
- Modify: `src/components/ProfileBar.tsx`
- Modify: `src/i18n/locales/en/common.json`, `src/i18n/locales/fr/common.json`, `src/i18n/locales/de/common.json`, `src/i18n/locales/it/common.json`
- Test: `src/__tests__/importIntegration.test.tsx` (or extend the existing app test)

**Interfaces:**
- Consumes: `ImportPanel` (Task 14).

- [ ] **Step 1: Add i18n keys (all four locales — key parity is gated)**

Add an `import` block to each `common.json`. English:

```json
"import": {
  "open": "Import install file…",
  "paste": "Paste a kickstart or autoinstall file",
  "placeholder": "Paste ks.cfg or user-data here…",
  "parse": "Parse",
  "chooseFile": "Choose file",
  "close": "Close",
  "confirm": "Confirm & load",
  "cancel": "Back",
  "success": "Install file imported",
  "mapped": "Mapped {{count}} settings",
  "preserved": "Preserved {{count}} verbatim",
  "verbatimNote": "Comments inside %pre/%post/%addon sections and un-modeled keys are preserved exactly; only comments on individual known directives are dropped (shown in the diff)."
}
```

French (`fr`):

```json
"import": {
  "open": "Importer un fichier d'installation…",
  "paste": "Collez un fichier kickstart ou autoinstall",
  "placeholder": "Collez ks.cfg ou user-data ici…",
  "parse": "Analyser",
  "chooseFile": "Choisir un fichier",
  "close": "Fermer",
  "confirm": "Confirmer et charger",
  "cancel": "Retour",
  "success": "Fichier d'installation importé",
  "mapped": "{{count}} paramètres mappés",
  "preserved": "{{count}} conservés tels quels",
  "verbatimNote": "Les commentaires dans les sections %pre/%post/%addon et les clés non modélisées sont conservés exactement ; seuls les commentaires sur les directives connues sont supprimés (visibles dans le diff)."
}
```

German (`de`):

```json
"import": {
  "open": "Installationsdatei importieren…",
  "paste": "Kickstart- oder Autoinstall-Datei einfügen",
  "placeholder": "ks.cfg oder user-data hier einfügen…",
  "parse": "Analysieren",
  "chooseFile": "Datei wählen",
  "close": "Schließen",
  "confirm": "Bestätigen & laden",
  "cancel": "Zurück",
  "success": "Installationsdatei importiert",
  "mapped": "{{count}} Einstellungen zugeordnet",
  "preserved": "{{count}} unverändert übernommen",
  "verbatimNote": "Kommentare in %pre/%post/%addon-Abschnitten und nicht modellierte Schlüssel bleiben exakt erhalten; nur Kommentare an einzelnen bekannten Direktiven entfallen (im Diff sichtbar)."
}
```

Italian (`it`):

```json
"import": {
  "open": "Importa file di installazione…",
  "paste": "Incolla un file kickstart o autoinstall",
  "placeholder": "Incolla ks.cfg o user-data qui…",
  "parse": "Analizza",
  "chooseFile": "Scegli file",
  "close": "Chiudi",
  "confirm": "Conferma e carica",
  "cancel": "Indietro",
  "success": "File di installazione importato",
  "mapped": "{{count}} impostazioni mappate",
  "preserved": "{{count}} mantenute alla lettera",
  "verbatimNote": "I commenti nelle sezioni %pre/%post/%addon e le chiavi non modellate sono preservati esattamente; solo i commenti sulle singole direttive note vengono rimossi (visibili nel diff)."
}
```

- [ ] **Step 2: Verify key parity stays green**

Run: `npx vitest run src/i18n/keyParity.test.ts`
Expected: PASS (all four locales now share the new `import.*` keys).

- [ ] **Step 3: Wire the panel into `ProfileBar`**

Add state + a button that toggles `ImportPanel`. Add imports:

```tsx
import { ImportPanel } from '@components/import/ImportPanel'
import { useState } from 'react'
```

Inside the component, add `const [importing, setImporting] = useState(false)`. Relabel the existing JSON button to `t('profile.import')` → keep, but add the new native-import button next to it:

```tsx
      <button type="button" className="btn-ghost" onClick={() => setImporting(true)}>
        {t('import.open')}
      </button>
```

And render the panel (e.g. below the bar) when `importing`:

```tsx
      {importing && (
        <div className="absolute z-10 mt-2 w-[36rem] max-w-[90vw]">
          <ImportPanel onClose={() => setImporting(false)} />
        </div>
      )}
```

> Wrap the `ProfileBar` root in `relative` if the absolute panel needs anchoring, matching the existing layout conventions.

- [ ] **Step 4: Write + run the integration test**

```tsx
// src/__tests__/importIntegration.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProfileBar } from '@components/ProfileBar'
import { useGeneratorStore } from '@store/generatorStore'

describe('import integration via ProfileBar', () => {
  it('opens the panel, parses, and loads a kickstart file', () => {
    render(<ProfileBar />)
    fireEvent.click(screen.getByRole('button', { name: /import install file/i }))
    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: 'text\nlang it_IT.UTF-8\n' } })
    fireEvent.click(screen.getByRole('button', { name: /parse/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(useGeneratorStore.getState().spec.locale.language).toBe('it_IT.UTF-8')
  })
})
```

Run: `npx vitest run src/__tests__/importIntegration.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Full gate + commit**

Run: `npx tsc --noEmit && npx biome check . && npx vitest run && npx vitest run --coverage`
Expected: all green; coverage on `src/engines/**` and `src/utils/**` ≥75%.

```bash
npx biome check --write src/
git add src/components/ProfileBar.tsx src/i18n/ src/__tests__/importIntegration.test.tsx
git commit -m "feat(ui): wire native-file import into ProfileBar + i18n (en/fr/de/it)"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Passthrough model (incl. `index`, `rawStorage`) → Task 1. Emit-merge (autoinstall extraKeys / kickstart buckets) → Tasks 3–4. `deepMerge` policy → Task 2. Detection → Task 5. Diff + LCS cap → Task 6. `roundTrip` fidelity → Task 7. Kickstart flags/tokenize/parse incl. continuations, all-or-nothing storage, occurrence index, remainder rule → Tasks 8–10. Autoinstall parse incl. leaf-level deletion, soft-fail → Task 11. `importFile` resilient soft-fail + hard-fail-on-garbage → Task 12. Corpus + idempotence + edge-case tests → Tasks 10/11/13. UX panel→review→confirm + verbatim disclosure → Tasks 14–15. i18n parity → Task 15.

**2. Placeholder scan** — no TBD/TODO; every code step carries complete, runnable code; tests show real assertions. The one "fill in additional command handlers" guidance in Task 13 is backed by the complete handler pattern in Task 10 and the remainder rule guarantees safety, not silence.

**3. Type consistency** — `ParseResult`/`ImportResult`/`FidelityReport`/`RoundTripResult`/`DiffLine`/`Flag`/`KsNode` are defined once (Shared Interfaces / Task 5 / Task 6 / Task 8 / Task 9) and consumed with identical names/shapes downstream. `deepMerge(winner, loser)`, `applyUnknownFlags(commands, unknownFlags)`, `detectFormat`, `tokenizeKickstart`, `parseFlags`, `parseKickstart`, `parseAutoinstall`, `roundTrip`, `importFile` keep the same signatures across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-27-round-trip-import.md`.
