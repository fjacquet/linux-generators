// src/__tests__/importIntegration.test.tsx

import { ProfileBar } from '@components/ProfileBar'
import { useGeneratorStore } from '@store/generatorStore'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('import integration via ProfileBar', () => {
  beforeEach(() => useGeneratorStore.getState().reset())

  it('opens the panel, parses, and loads a kickstart file', () => {
    render(<ProfileBar />)
    fireEvent.click(screen.getByRole('button', { name: /import install file/i }))
    fireEvent.change(screen.getByLabelText(/paste/i), {
      target: { value: 'text\nlang it_IT.UTF-8\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: /parse/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(useGeneratorStore.getState().spec.locale.language).toBe('it_IT.UTF-8')
  })
})
