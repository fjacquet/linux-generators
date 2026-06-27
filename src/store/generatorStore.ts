import {
  defaultTargetForFormat,
  formatForOsFamily,
  freshDefaultSpec,
  type InstallSpec,
  InstallSpecSchema,
  type TargetFormat,
} from '@engines/model'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// Inputs-only store, modeled on vatlas's snapshotStore: it holds the spec being
// edited and UI prefs — never derived/generated output (that lives in the
// single `useGeneratedConfig` memo). The spec object is REPLACED on every edit
// (Zustand `Object.is`), never mutated in place, so subscribers re-render.
//
// Persistence is OPT-IN (ui.draftAutosave, default off) and STRIPS credential
// fields — a refresh-recovery convenience that never writes secrets to disk.
// Full persistence is the explicit JSON-profile export.

export interface UiState {
  collapsed: Record<string, boolean>
  showRawPanels: boolean
  draftAutosave: boolean
}

interface GeneratorState {
  spec: InstallSpec
  targetFormat: TargetFormat
  ui: UiState
  update: (mutate: (draft: InstallSpec) => void) => void
  setTargetFormat: (format: TargetFormat) => void
  chooseFormat: (format: TargetFormat) => void
  toggleSection: (sectionId: string) => void
  setShowRawPanels: (show: boolean) => void
  setDraftAutosave: (enabled: boolean) => void
  loadProfile: (spec: InstallSpec) => void
  reset: () => void
}

const INITIAL_UI: UiState = { collapsed: {}, showRawPanels: false, draftAutosave: false }
const DRAFT_KEY = 'linux-generators-draft'

/** Remove every credential field — what the autosave is allowed to persist. */
function stripSecrets(spec: InstallSpec): InstallSpec {
  const s = structuredClone(spec)
  s.storage.encryption.passphrase = ''
  s.identity.rootPasswordCrypt = ''
  s.identity.primaryUser.passwordCrypt = ''
  return s
}

export const useGeneratorStore = create<GeneratorState>()(
  persist(
    (set) => ({
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

      setDraftAutosave: (enabled) => {
        set((state) => ({ ui: { ...state.ui, draftAutosave: enabled } }))
        if (!enabled) useGeneratorStore.persist.clearStorage()
      },

      // Loading a profile/preset also syncs the active format to its OS family.
      loadProfile: (spec) => set({ spec, targetFormat: formatForOsFamily(spec.target.osFamily) }),

      reset: () => set({ spec: freshDefaultSpec(), ui: INITIAL_UI }),
    }),
    {
      name: DRAFT_KEY,
      storage: createJSONStorage(() => localStorage),
      // Persist only when opted in, and never the secrets.
      partialize: (state) =>
        state.ui.draftAutosave
          ? {
              draftAutosave: true,
              spec: stripSecrets(state.spec),
              targetFormat: state.targetFormat,
            }
          : { draftAutosave: false },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<{
          draftAutosave: boolean
          spec: unknown
          targetFormat: TargetFormat
        }>
        const restored = p.spec ? InstallSpecSchema.safeParse(p.spec) : null
        return {
          ...current,
          ...(restored?.success ? { spec: restored.data } : {}),
          ...(p.targetFormat ? { targetFormat: p.targetFormat } : {}),
          ui: { ...current.ui, draftAutosave: p.draftAutosave ?? current.ui.draftAutosave },
        }
      },
    },
  ),
)

// Selectors — stable references on unchanged state (never construct here).
export const selectSpec = (s: GeneratorState): InstallSpec => s.spec
export const selectTargetFormat = (s: GeneratorState): TargetFormat => s.targetFormat
export const selectUi = (s: GeneratorState): UiState => s.ui
export const selectUpdate = (s: GeneratorState): GeneratorState['update'] => s.update
