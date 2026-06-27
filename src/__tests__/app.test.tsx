import { useGeneratorStore } from '@store/generatorStore'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App'

describe('App', () => {
  beforeEach(() => {
    useGeneratorStore.setState({
      spec: useGeneratorStore.getState().spec,
      targetFormat: 'kickstart',
    })
    useGeneratorStore.getState().reset()
    localStorage.clear()
  })

  it('renders the title and a Kickstart download by default', () => {
    render(<App />)
    expect(screen.getByText('Linux Install Generator')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download ks\.cfg/i })).toBeInTheDocument()
  })

  it('switches to Autoinstall and surfaces a login diagnostic', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Autoinstall \(Ubuntu\)/i }))

    expect(screen.getByRole('button', { name: /Download user-data/i })).toBeInTheDocument()
    // The key-less default has no way to log in — the validator says so.
    expect(screen.getByText(/No login method/i)).toBeInTheDocument()
  })

  it('reflects a hostname edit live in the preview', async () => {
    const user = userEvent.setup()
    render(<App />)
    const hostname = screen.getByLabelText('Hostname')
    await user.clear(hostname)
    await user.type(hostname, 'web42')
    expect(screen.getByText(/--hostname=web42/)).toBeInTheDocument()
  })
})
