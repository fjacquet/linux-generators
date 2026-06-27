import type { InstallSpec, TargetFormat } from '../model/installSpec'
import type { Diagnostic } from '../types'
import { validateAutoinstall } from './validateAutoinstall'
import { validateKickstart } from './validateKickstart'

/** Run the correctness rules for the selected format. */
export function validate(spec: InstallSpec, format: TargetFormat): Diagnostic[] {
  return format === 'autoinstall' ? validateAutoinstall(spec) : validateKickstart(spec)
}

export { validateAutoinstall } from './validateAutoinstall'
export { validateKickstart } from './validateKickstart'
