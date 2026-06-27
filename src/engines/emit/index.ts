import type { InstallSpec, TargetFormat } from '../model/installSpec'
import { emitAutoinstall } from './autoinstall'
import { emitKickstart } from './kickstart'
import type { EmitResult } from './types'

/** Dispatch to the engine for the selected target format. */
export function emit(spec: InstallSpec, format: TargetFormat): EmitResult {
  return format === 'autoinstall' ? emitAutoinstall(spec) : emitKickstart(spec)
}

export { emitAutoinstall } from './autoinstall'
export { emitKickstart } from './kickstart'
export type { Quirks } from './quirks'
export { quirksFor } from './quirks'
export type { ConfigLanguage, EmitResult, EmittedFile } from './types'
