import type { InstallSpec } from '../model'

// An exported profile is the user's explicit, full save-to-disk — it includes
// every field (a profile must reproduce the spec exactly). Secret-stripping
// applies only to the silent localStorage autosave, never here.
export const serialize = (spec: InstallSpec): string => JSON.stringify(spec, null, 2)
