# Import Fidelity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the surfaced-but-real round-trip fidelity gaps (final-review I2/I3) so that importing a real-world Kickstart/Autoinstall file and re-emitting it drops NO directive flag — every original token is either mapped to the spec or preserved in a passthrough bucket and re-emitted.

**Architecture:** Extend the existing "Approach B — Spec + passthrough" with (a) slot-keyed verbatim capture of the constant commands and section headers the kickstart emitter hardcodes, (b) leaf-precise (not whole-subtree) deletion in the autoinstall parser, and (c) a structural corpus assertion — every non-cosmetic ORIGINAL token must appear in the re-emit (multiset subset) — as the forcing function that proves nothing is dropped.

**Tech Stack:** React 19 + TS strict, Zod 4, Vitest 4, Biome (single quotes, no semicolons, 2-space, lineWidth 100).

## Global Constraints

- `schemaVersion` stays `1`; all new passthrough fields are additive with `.default(...)` so old profiles still parse (backward-compatible).
- Engines stay pure. No new dependencies. KISS/DRY.
- The line-level `classifyFidelity` is NOT changed (its invariant comment from the fix wave stays). The new structural check lives in the corpus test only.
- The structural corpus assertion is the acceptance gate: `every non-cosmetic original token ∈ re-emit token multiset`. Fixtures use the emitter's CANONICAL forms for mapped directives (so value-canonicalization like `keyboard us`→`--vckeymap=us` does not false-positive), plus edge flags to exercise the new captures.
- After each task: `npx vitest run && npx tsc --noEmit && npx biome check .` green; engines/utils coverage ≥75%. Scan changed files with semgrep.

---

### Task HK: Kickstart verbatim capture (model + emitter + parser)

Lands together because round-trip needs parser capture AND emitter re-emission to agree.

**Files:**
- Modify: `src/engines/model/installSpec.ts` (passthrough.kickstart: add 4 fields)
- Modify: `src/engines/emit/kickstart/sections.ts` (keyboard, packagesBlock, constant slots), `src/engines/emit/kickstart/emitKickstart.ts` (constant slots, %pre/%post headers)
- Modify: `src/engines/import/kickstart/parseKickstart.ts` (constants, %packages/%pre/%post headers, keyboard --xlayouts, autopart --nohome)
- Update: `src/engines/emit/kickstart/__snapshots__/emitKickstart.test.ts.snap` (keyboard line only)
- Test: `parseKickstart.test.ts`, `sections.test.ts`/`emitKickstart*.test.ts` as needed

**Interfaces produced (later tasks/consumers rely on these):**
- `passthrough.kickstart.constantLines: Record<string,string>` — slot → raw command line. Slots: `mode`, `bootloader`, `services`, `firstboot`, `power`.
- `passthrough.kickstart.packagesHeader: string` — text AFTER `%packages` on the header line (e.g. ` --ignoremissing --excludedocs`), '' default.
- `passthrough.kickstart.preHeader: string`, `postHeader: string` — the full captured section header line (e.g. `%post --log=/root/post.log`), '' default = emitter uses its hardcoded default header.

#### Design decisions (pin these exactly)

**Constant slots.** The emitter emits a fixed set of opinionated constants. Map each constant command to a SLOT and emit `constantLines[slot] ?? <hardcoded default>`:

| slot | commands that fill it (parser) | emitter default when slot empty |
|---|---|---|
| `mode` | `text`, `graphical`, `cmdline` | `text` |
| `bootloader` | `bootloader` | `bootloader --location=mbr` (current `bootloaderLine`) |
| `services` | `services` | `services --enabled=sshd,chronyd` |
| `firstboot` | `firstboot` | `firstboot --disable` |
| `power` | `reboot`, `poweroff`, `halt`, `shutdown` | `reboot` |

Parser stores `constantLines[slot] = node.raw` (the verbatim original line). Emitter emits the slot value if present else the default. This is duplication-free (replaces the default, not appended) and idempotent (re-parse stores the same raw line into the same slot). Default spec (no import) → all slots empty → identical hardcoded output → existing snapshots unchanged for these lines.

**keyboard.** The emitter currently FABRICATES `--xlayouts='${keyboard}'` (sections.ts:24), which both invents an xlayouts and clobbers any real one. Change the emit to `keyboard --vckeymap=${keyboard}` (drop the fabricated xlayouts). Parser: stop filtering `xlayouts` out of `recordUnknownFlags` (parseKickstart.ts:144) so a real `--xlayouts=fr` is recorded and re-appended by `applyUnknownFlags`. This DOES change the keyboard line in the existing golden snapshots — update them to `keyboard --vckeymap=<v>` (one line per snapshot).

**%packages header.** Emitter: `packagesBlock` first line becomes `` `%packages${spec.passthrough.kickstart.packagesHeader}` ``. Parser: when `header.startsWith('%packages')`, set `packagesHeader = header.slice('%packages'.length)` (keeps the leading space + flags, '' when bare).

**%pre/%post headers.** Emitter: replace the hardcoded `'%pre --log=/var/log/ks-pre.log'` / `'%post --log=/var/log/ks-post.log'` with `preHeader || '%pre --log=/var/log/ks-pre.log'` and `postHeader || '%post --log=/var/log/ks-post.log'`. Parser: when matching `%pre`/`%post`, set `preHeader`/`postHeader = header` (the full original header line) before storing the body. Default '' → emitter default header (snapshots unchanged).

**autopart --nohome.** Split the set: keep `AUTOPART_KNOWN = {type,encrypted,passphrase,nohome}` for the complex-storage trigger (line 55-66 unchanged — `--nohome` must NOT force complex mode), but record unconsumed flags against a NEW `AUTOPART_CONSUMED = new Set(['type','encrypted','passphrase'])`, i.e. `recordUnknownFlags(name, index, flags.filter((f) => !AUTOPART_CONSUMED.has(f.key)))`. Now `--nohome` is recorded → `applyUnknownFlags` re-appends it to the emitted `autopart` line.

- [ ] **Step 1: Add the 4 passthrough.kickstart fields (Zod, backward-compatible)**

In `installSpec.ts` passthrough.kickstart object, add after `rawStorage`:
```ts
constantLines: z.record(z.string(), z.string()).default({}),
packagesHeader: z.string().default(''),
preHeader: z.string().default(''),
postHeader: z.string().default(''),
```

- [ ] **Step 2: Emitter — constant slots + keyboard + packages + headers**

In `sections.ts`: change the keyboard line to `` `keyboard --vckeymap=${keyboard}` ``; change `packagesBlock` first element to `` `%packages${spec.passthrough.kickstart.packagesHeader}` ``. Add a helper `constantLine(spec, slot, fallback)` returning `spec.passthrough.kickstart.constantLines[slot] ?? fallback`. In `emitKickstart.ts`: replace `'text'` with `constantLine(spec,'mode','text')`; `bootloaderLine(spec)` call site with `constantLine(spec,'bootloader', bootloaderLine(spec))`; `'firstboot --disable'` with `constantLine(spec,'firstboot','firstboot --disable')`; `'reboot'` with `constantLine(spec,'power','reboot')`; and the hardcoded `services --enabled=sshd,chronyd` (sections.ts:122) wrapped likewise via slot `services`. Replace the `%pre`/`%post` header strings with `preHeader || default` / `postHeader || default`.

- [ ] **Step 3: Parser — fill the slots/headers/flags**

In `parseKickstart.ts`: replace the constant case block (123-133) so each constant sets `spec.passthrough.kickstart.constantLines[slot] = node.raw` (map command→slot per the table; `halt`/`poweroff`/`shutdown` join the `power` slot — add them to the case list). Set `packagesHeader`/`preHeader`/`postHeader` in the section handlers. Remove `xlayouts` from the keyboard filter. Add `AUTOPART_CONSUMED` and use it for the autopart record filter.

- [ ] **Step 4: Tests + snapshots**

Add round-trip unit tests in `parseKickstart.test.ts`: `bootloader --location=mbr --append=quiet` round-trips (constantLines.bootloader set; re-emit contains `--append=quiet`); `services --disabled=kdump` preserved; `%packages --ignoremissing` preserved (packagesHeader); `%post --log=/root/post.log` preserved (postHeader); `keyboard --vckeymap=us --xlayouts=fr` preserves `--xlayouts=fr`; `autopart --type=lvm --nohome` preserves `--nohome`. Update the keyboard line in the emit golden snapshots. Run `npx vitest run src/engines/emit/kickstart src/engines/import/kickstart && npx tsc --noEmit`.

- [ ] **Step 5: Commit** `feat(import): capture kickstart constant/section-header/keyboard/autopart flags`

---

### Task HA: Autoinstall leaf-precise deletion

**Files:** Modify `src/engines/import/autoinstall/parseAutoinstall.ts`; Test `parseAutoinstall.test.ts`.

Replace the three whole-subtree `consume(...)` calls so unmodeled sibling leaves survive in `extraKeys`:

- [ ] **Step 1:** `network.ethernets` (line 205): instead of `consume('network','ethernets')`, for each device in `ethernets` consume only the mapped leaves: `consume('network','ethernets',device,'dhcp4')`, `'addresses'`, `'gateway4'`, `'nameservers')`. Leave `routes`, `mtu`, `match`, `dhcp6`, etc. in `extraKeys`. (`deleteLeaf` already removes a device object and the `ethernets`/`network` parents when they become empty.)
- [ ] **Step 2:** `storage.layout` (line 220): consume only the mapped leaves (`name`, and `password`/`encrypted` if mapped) instead of the whole `layout`. Leave `sizing-policy` etc.
- [ ] **Step 3:** `apt.primary` (line 243) — IMPORTANT: `consume()`/`deleteLeaf` CANNOT be used here. `extra` is a `structuredClone(ai)` (line 121), and `deleteLeaf` recurses only through `isObj` which excludes arrays (`apt.primary` is an array). So (a) mutating `ai.apt.primary[0]` has no effect on the returned `extraKeys` (built from `extra`), and (b) `consume('apt','primary','0','uri')` is a silent no-op. Read `uri` from `ai` for the mapping, then delete the leaf MANUALLY on the `extra` clone:
```ts
if (isObj(ai.apt) && Array.isArray(ai.apt.primary)) {
  const first = ai.apt.primary[0]
  if (isObj(first)) {
    const uri = asString(first.uri)
    if (uri) spec.packages.aptMirror = uri
  }
  // delete the mapped leaf on the `extra` clone (deleteLeaf can't reach into arrays)
  const extraApt = extra.apt
  if (isObj(extraApt) && Array.isArray(extraApt.primary)) {
    const extraFirst = extraApt.primary[0]
    if (isObj(extraFirst)) {
      delete extraFirst.uri
      if (Object.keys(extraFirst).length === 0) extraApt.primary.shift()
    }
    if (extraApt.primary.length === 0) delete extraApt.primary
    if (Object.keys(extraApt).length === 0) delete extra.apt
  }
  mapped++
}
```
Leave `arches` and any further entries in `extraKeys`. (Code comment: a CUSTOM `arches` on the primary mirror is preserved in `extraKeys` but, due to deepMerge array-replace, the emitter's default `arches:[default]` wins on re-emit — acceptable known edge; uri round-trips.)
- [ ] **Step 4: `shutdown` (separate silent-loss bug — fix here).** The parser consumes+discards `shutdown` (lines 270-271) while the emitter hardcodes `autoinstall.shutdown = 'reboot'` (emitAutoinstall.ts:143) and is the deepMerge WINNER — so a custom `shutdown: poweroff`/`halt` is silently overwritten by `reboot`. Fix: (a) parser — DELETE the `if ('shutdown' in ai) { consume('shutdown'); mapped++ }` block entirely so `shutdown` survives into `extraKeys`; (b) emitter — replace `autoinstall.shutdown = 'reboot'` with `autoinstall.shutdown = (extraKeys.shutdown as string) ?? 'reboot'`. Default spec (empty extraKeys) → `'reboot'` → snapshots unchanged; imported `shutdown: poweroff` → `extraKeys.shutdown='poweroff'` → winner is `'poweroff'` → round-trips. NOTE: read `extraKeys` (`spec.passthrough.autoinstall.extraKeys`) BEFORE the `deepMerge` call at emitAutoinstall.ts:145-146.
- [ ] **Step 5: Tests** — a `user-data` with `ethernets.eth0.mtu: 1400` + `match` preserves them in `extraKeys` and round-trips idempotently; `storage.layout.sizing-policy` preserved; `apt.primary[0].arches` preserved in `extraKeys` (and `uri` still maps to aptMirror); `shutdown: poweroff` round-trips (not overwritten by reboot). Run `npx vitest run src/engines/import/autoinstall src/engines/emit/autoinstall && npx tsc --noEmit`.
- [ ] **Step 6: Commit** `feat(import): leaf-precise autoinstall deletion + preserve shutdown/netplan/apt/layout keys`

---

### Task HC: Structural "nothing dropped" corpus assertion (forcing function)

**Files:** Modify `src/__fixtures__/importCorpus/rhel-complex.ks`, `src/__fixtures__/importCorpus/ubuntu-complex.user-data`, `src/engines/import/corpus.test.ts`.

- [ ] **Step 1: Enrich fixtures with edge flags, in canonical mapped-form.** Rewrite the kickstart fixture so mapped directives use the emitter's canonical forms (e.g. `keyboard --vckeymap=us`, network with the emitter's flag order) AND add the previously-dropped constructs: `bootloader --location=mbr --append="quiet"`, `services --enabled=sshd --disabled=kdump`, `%packages --ignoremissing`, a `%post --log=/root/post.log` header, `keyboard --vckeymap=us --xlayouts='fr'`. For the autoinstall fixture add `ethernets.eth0.mtu`, a `match`, `storage.layout.sizing-policy`, `apt.primary[0].arches`, and change `shutdown: reboot` → `shutdown: poweroff` (exercises the HA shutdown fix).
- [ ] **Step 2: Add the structural assertion.** A helper tokenizes non-cosmetic lines (reuse the quote-aware split `/(?:[^\s"']+|"[^"]*"|'[^']*')+/g`; skip blank and `#`-only lines; treat `%`-section markers as tokens). NORMALIZE every token by stripping all quote chars: `const norm = (t: string): string => t.replace(/['"]/g, '')` — this makes `--xlayouts='fr'` and `--xlayouts=fr`, or `--vckeymap='us'` and `--vckeymap=us`, compare equal (the emitter re-quotes mapped values differently than the source). For each fixture build a SET of normalized re-emit tokens, then assert every normalized non-cosmetic ORIGINAL token is in that set — fail naming the first unaccounted token. Use a UNIQUE-SET subset check (`uniqueOriginal ⊆ uniqueReEmit`), NOT a multiset: the emitter legitimately de-duplicates redundant flags (e.g. `clearpart --all --all` → `clearpart --all`), which a multiset check would wrongly flag, whereas a dropped flag is a token absent from the re-emit set either way. Keep the existing idempotence, canonical-exact, and passthrough spot-check assertions.
- [ ] **Step 3: Make it green.** Run `npx vitest run src/engines/import/corpus.test.ts`. Any unaccounted token is a real drop — fix it in HK/HA (capture it), never weaken the assertion. If a token genuinely cannot round-trip end-to-end and capturing it is out of scope, remove that one construct from the fixture and log the limitation in a code comment + the report.
- [ ] **Step 4: Full gate.** `npx vitest run && npx tsc --noEmit && npx biome check . && npx vitest run --coverage` (engines/utils ≥75%).
- [ ] **Step 5: Commit** `test(import): structural nothing-dropped corpus assertion + enriched fixtures`

---

## Self-Review

- **Coverage:** I2 constant-flags → HK constantLines; %packages → HK packagesHeader; %pre/%post → HK headers; keyboard --xlayouts → HK; autopart --nohome → HK; autoinstall ethernets/layout/apt → HA leaf-precise. I3 structural blind spot → HC assertion.
- **Backward-compat:** all new fields `.default(...)`, schemaVersion unchanged; default-spec emit unchanged except the keyboard line (snapshot updated intentionally).
- **Type consistency:** `constantLines`/`packagesHeader`/`preHeader`/`postHeader` defined once in the model and consumed by emitter + parser with identical names.
- **Known edge (documented, not silent):** custom `apt.primary[0].arches` preserved in `extraKeys` but emitter's default arches wins on re-emit (deepMerge array-replace). uri round-trips.
