// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_PERSONAL', '1')
  vi.stubEnv('VITE_DEMO', '0')
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

test('a personal build starts a blank local rotation without contacting a backend', async () => {
  const fetch = vi.fn(() => { throw new Error('unexpected network request') })
  vi.stubGlobal('fetch', fetch)
  const { useStore } = await import('./useStore.js')
  const { isOn } = await import('../lib/modules.js')
  await useStore.getState().boot()
  const { S, isGuest, ready } = useStore.getState()
  expect({ guest: isGuest(), ready }).toEqual({ guest: true, ready: true })
  expect(S).toMatchObject({ workouts: [], routines: [], bodyweight: [], scheduleMode: 'rotation' })
  expect(isOn(S, 'coach')).toBe(false)
  expect(localStorage.getItem('gym_demo_seeded_v1')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

test('personal boot preserves existing browser routines and schedule mode', async () => {
  localStorage.setItem('gym_state_v1', JSON.stringify({ routines: [{ id: 'existing', name: 'My routine', ex: [] }], scheduleMode: 'week' }))
  const { useStore } = await import('./useStore.js')
  await useStore.getState().boot()
  expect(useStore.getState().S).toMatchObject({ routines: [{ id: 'existing', name: 'My routine' }], scheduleMode: 'week' })
})
