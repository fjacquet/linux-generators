import type { InstallSpec, TargetFormat } from '../model/installSpec'
import type { Diagnostic } from '../types'
import { validateAutoinstall } from './validateAutoinstall'
import { validateKickstart } from './validateKickstart'
import { validatePreseed } from './validatePreseed'

/** Run the correctness rules for the selected format. */
export function validate(spec: InstallSpec, format: TargetFormat): Diagnostic[] {
  switch (format) {
    case 'autoinstall':
      return validateAutoinstall(spec)
    case 'preseed':
      return validatePreseed(spec)
    default:
      return validateKickstart(spec)
  }
}

export { validateAutoinstall } from './validateAutoinstall'
export { validateKickstart } from './validateKickstart'
export { validatePreseed } from './validatePreseed'
