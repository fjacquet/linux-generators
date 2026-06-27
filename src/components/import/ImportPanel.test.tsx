// src/components/import/ImportPanel.test.tsx

import { useGeneratorStore } from '@store/generatorStore'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ImportPanel } from './ImportPanel'

describe('ImportPanel', () => {
  beforeEach(() => useGeneratorStore.getState().reset())

  it('parses pasted kickstart text and confirms into the store', () => {
    render(<ImportPanel onClose={() => {}} />)
    const ks = 'text\nlang fr_FR.UTF-8\nselinux --permissive\n'
    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: ks } })
    fireEvent.click(screen.getByRole('button', { name: /parse/i }))
    expect(screen.getByText(/mapped/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(useGeneratorStore.getState().spec.locale.language).toBe('fr_FR.UTF-8')
    expect(useGeneratorStore.getState().spec.security.selinux).toBe('permissive')
  })

  it('shows an error for empty input on parse', () => {
    render(<ImportPanel onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /parse/i }))
    expect(screen.getByText(/empty input/i)).toBeInTheDocument()
  })
})
