import { useGeneratorStore } from '@store/generatorStore'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SecuritySection } from './SecuritySection'

// reset() restores the default RHEL spec but leaves targetFormat untouched, so
// every test sets the format explicitly via chooseFormat (which syncs both).
describe('SecuritySection cross-format note', () => {
  beforeEach(() => useGeneratorStore.getState().reset())

  it('shows the "not emitted" note for a customized firewall on Ubuntu', () => {
    useGeneratorStore.getState().chooseFormat('autoinstall')
    useGeneratorStore.getState().update((d) => {
      // default ['ssh'] is silent; an extra service is lost intent on Ubuntu
      d.security.firewall.services = ['ssh', 'http']
    })
    render(<SecuritySection />)
    expect(screen.getByText(/not emitted for/i)).toBeInTheDocument()
  })

  it('shows no note for the default ssh-only firewall on Ubuntu', () => {
    useGeneratorStore.getState().chooseFormat('autoinstall')
    render(<SecuritySection />)
    expect(screen.queryByText(/not emitted for/i)).not.toBeInTheDocument()
  })

  it('shows no note on a Kickstart target even with a customized firewall', () => {
    useGeneratorStore.getState().chooseFormat('kickstart')
    useGeneratorStore.getState().update((d) => {
      d.security.firewall.services = ['ssh', 'http']
    })
    render(<SecuritySection />)
    // firewall is native to Kickstart → never a cross-format drop here
    expect(screen.queryByText(/not emitted for/i)).not.toBeInTheDocument()
  })
})

describe('SecuritySection on a Debian (preseed) target', () => {
  beforeEach(() => useGeneratorStore.getState().reset())

  it('shows AppArmor, not SELinux, on a preseed target', () => {
    useGeneratorStore.getState().chooseFormat('preseed')
    render(<SecuritySection />)
    expect(screen.getByText('AppArmor mode')).toBeInTheDocument()
    expect(screen.queryByText('SELinux mode')).not.toBeInTheDocument()
  })

  it('shows no "not emitted" note for a customized firewall on Debian', () => {
    useGeneratorStore.getState().chooseFormat('preseed')
    useGeneratorStore.getState().update((d) => {
      d.security.firewall.services = ['ssh', 'http']
    })
    render(<SecuritySection />)
    expect(screen.queryByText(/not emitted for/i)).not.toBeInTheDocument()
  })
})
