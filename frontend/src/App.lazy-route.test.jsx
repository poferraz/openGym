// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import App from './App.jsx'
import { useStore } from './store/useStore.js'

const loading = vi.hoisted(() => Promise.withResolvers())
vi.mock('./views/Settings.jsx', async () => {
  await loading.promise
  return { SettingsRoute: function SettingsRoute() {
    const [value, setValue] = useState('')
    return <button type="button" data-route-state onClick={() => setValue('Draft focus')}>{value}</button>
  } }
})

it('retains a cold settings route after its first store update', async () => {
  const before = useStore.getState()
  const oldHash = location.hash
  const actEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  const field = () => host.querySelector('[data-route-state]')
  localStorage.setItem('gym_guest', '1')
  try {
    location.hash = '#/settings/training-profile'
    useStore.setState({ ready: true, boot: vi.fn() })
    await act(async () => { root.render(<App />) })
    expect(field()).toBeNull()
    await act(async () => { loading.resolve() })
    await vi.waitFor(() => expect(field()).not.toBeNull())
    await act(async () => field().click())
    const mounted = field()
    await act(async () => { useStore.setState(state => ({ S: { ...state.S, personalOllamaModel: 'test-model' } })) })
    expect(field()).toBe(mounted)
    expect(field().textContent).toBe('Draft focus')
  } finally {
    await act(async () => root.unmount())
    host.remove()
    useStore.setState(before)
    location.hash = oldHash
    localStorage.removeItem('gym_guest')
    globalThis.IS_REACT_ACT_ENVIRONMENT = actEnvironment
  }
})
