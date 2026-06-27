import {
  defaultTargetForFormat,
  freshDefaultSpec,
  type InstallSpec,
  type TargetFormat,
} from '@engines/model'
import { create } from 'zustand'

// Inputs-only store, modeled on vatlas's snapshotStore: it holds the spec being
// edited and UI prefs — never derived/generated output (that lives in the
// single `useGeneratedConfig` memo). The spec object is REPLACED on every edit
// (Zustand `Object.is`), never mutated in place, so subscribers re-render.
//
// No persistence here in Phase 1. Opt-in localStorage draft autosave (secrets
// stripped) arrives in Phase 4.

export interface UiState {
  /** sectionId → collapsed? (absent = expanded). */
  collapsed: Record<string, boolean>
  /** Reveal raw per-format override textareas. */
  showRawPanels: boolean
  /** Opt-in localStorage draft autosave (default off). */
  draftAutosave: boolean
}

interface GeneratorState {
  spec: InstallSpec
  targetFormat: TargetFormat
  ui: UiState
  /** Ergonomic immutable update: mutate a fresh draft; the store swaps the ref. */
  update: (mutate: (draft: InstallSpec) => void) => void
  setTargetFormat: (format: TargetFormat) => void
  /** Switch format AND sync the target OS family/distro/version to match. */
  chooseFormat: (format: TargetFormat) => void
  toggleSection: (sectionId: string) => void
  setShowRawPanels: (show: boolean) => void
  loadProfile: (spec: InstallSpec) => void
  reset: () => void
}

const INITIAL_UI: UiState = { collapsed: {}, showRawPanels: false, draftAutosave: false }

export const useGeneratorStore = create<GeneratorState>((set) => ({
  spec: freshDefaultSpec(),
  targetFormat: 'kickstart',
  ui: INITIAL_UI,

  update: (mutate) =>
    set((state) => {
      const draft = structuredClone(state.spec)
      mutate(draft)
      return { spec: draft }
    }),

  setTargetFormat: (format) => set({ targetFormat: format }),

  chooseFormat: (format) =>
    set((state) => {
      const spec = structuredClone(state.spec)
      Object.assign(spec.target, defaultTargetForFormat(format))
      return { spec, targetFormat: format }
    }),

  toggleSection: (sectionId) =>
    set((state) => ({
      ui: {
        ...state.ui,
        collapsed: { ...state.ui.collapsed, [sectionId]: !state.ui.collapsed[sectionId] },
      },
    })),

  setShowRawPanels: (show) => set((state) => ({ ui: { ...state.ui, showRawPanels: show } })),

  loadProfile: (spec) => set({ spec }),

  reset: () => set({ spec: freshDefaultSpec(), ui: INITIAL_UI }),
}))

// Selectors — stable references on unchanged state (never construct here).
export const selectSpec = (s: GeneratorState): InstallSpec => s.spec
export const selectTargetFormat = (s: GeneratorState): TargetFormat => s.targetFormat
export const selectUi = (s: GeneratorState): UiState => s.ui
export const selectUpdate = (s: GeneratorState): GeneratorState['update'] => s.update
