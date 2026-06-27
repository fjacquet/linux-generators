import { freshDefaultSpec } from '@engines/model'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGeneratorStore } from './generatorStore'

const DRAFT_KEY = 'linux-generators-draft'

describe('generatorStore draft autosave', () => {
  beforeEach(() => {
    useGeneratorStore.setState({
      spec: freshDefaultSpec(),
      targetFormat: 'kickstart',
      ui: { collapsed: {}, showRawPanels: false, draftAutosave: false },
    })
    localStorage.clear()
  })

  it('never writes credential fields to localStorage, even when autosave is on', () => {
    const { update, setDraftAutosave } = useGeneratorStore.getState()
    update((d) => {
      d.storage.encryption = { enabled: true, passphrase: 'topsecret-luks' }
      d.identity.primaryUser.passwordMode = 'hashed'
      d.identity.primaryUser.passwordCrypt = '$6$saltsalt$hashhash'
    })
    setDraftAutosave(true)

    const raw = localStorage.getItem(DRAFT_KEY) ?? ''
    expect(raw).not.toContain('topsecret-luks')
    expect(raw).not.toContain('$6$saltsalt$hashhash')
    // The non-secret spec is still saved.
    expect(raw).toContain('autopart-lvm')
  })

  it('clears the persisted draft when autosave is turned off', () => {
    const { setDraftAutosave } = useGeneratorStore.getState()
    setDraftAutosave(true)
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
    setDraftAutosave(false)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('syncs the format to the OS family when a profile is loaded', () => {
    const ubuntuSpec = freshDefaultSpec()
    Object.assign(ubuntuSpec.target, { osFamily: 'ubuntu', distro: 'ubuntu', version: '24.04' })
    useGeneratorStore.getState().loadProfile(ubuntuSpec)
    expect(useGeneratorStore.getState().targetFormat).toBe('autoinstall')
  })
})
