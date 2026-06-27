import { useGeneratorStore } from '@store/generatorStore'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { IdentitySection } from './IdentitySection'

// reset() restores the default RHEL spec but leaves targetFormat untouched, so
// every test sets the format explicitly via chooseFormat (which syncs both).
describe('IdentitySection cross-format note', () => {
  beforeEach(() => useGeneratorStore.getState().reset())

  it('shows the "not emitted" note for a root password on Ubuntu', () => {
    useGeneratorStore.getState().chooseFormat('autoinstall')
    useGeneratorStore.getState().update((d) => {
      // today's Autoinstall emitter locks root → password policy is lost intent
      d.identity.rootPolicy = 'password'
    })
    render(<IdentitySection />)
    expect(screen.getByText(/not emitted for/i)).toBeInTheDocument()
  })

  it('shows no note for the default locked root policy on Ubuntu', () => {
    useGeneratorStore.getState().chooseFormat('autoinstall')
    render(<IdentitySection />)
    expect(screen.queryByText(/not emitted for/i)).not.toBeInTheDocument()
  })

  it('shows no note on a Kickstart target even with a root password', () => {
    useGeneratorStore.getState().chooseFormat('kickstart')
    useGeneratorStore.getState().update((d) => {
      d.identity.rootPolicy = 'password'
    })
    render(<IdentitySection />)
    // Kickstart emits rootpw natively → never a cross-format drop here
    expect(screen.queryByText(/not emitted for/i)).not.toBeInTheDocument()
  })
})
