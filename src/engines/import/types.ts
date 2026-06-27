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
