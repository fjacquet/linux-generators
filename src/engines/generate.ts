import type { EmitResult } from './emit'
import { emit } from './emit'
import type { InstallSpec, TargetFormat } from './model'
import { validate } from './validate'

/**
 * The full pipeline: render the file(s) and collect every diagnostic — the
 * engine's cross-format warnings plus the correctness rules. This is what the
 * UI's single `useGeneratedConfig` memo calls.
 */
export function generate(spec: InstallSpec, format: TargetFormat): EmitResult {
  const emitted = emit(spec, format)
  return {
    files: emitted.files,
    diagnostics: [...emitted.diagnostics, ...validate(spec, format)],
  }
}
