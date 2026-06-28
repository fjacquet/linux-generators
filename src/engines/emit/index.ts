import type { InstallSpec, TargetFormat } from '../model/installSpec'
import { emitAutoinstall } from './autoinstall'
import { emitKickstart } from './kickstart'
import { emitPreseed } from './preseed'
import type { EmitResult } from './types'

/** Dispatch to the engine for the selected target format. */
export function emit(spec: InstallSpec, format: TargetFormat): EmitResult {
  switch (format) {
    case 'autoinstall':
      return emitAutoinstall(spec)
    case 'preseed':
      return emitPreseed(spec)
    default:
      return emitKickstart(spec)
  }
}

export { emitAutoinstall } from './autoinstall'
export type { CrossFormatDrop } from './crossFormat'
export { crossFormatDrops } from './crossFormat'
export { emitKickstart } from './kickstart'
export { emitPreseed } from './preseed'
export type { Quirks } from './quirks'
export { quirksFor } from './quirks'
export type { ConfigLanguage, EmitResult, EmittedFile } from './types'
