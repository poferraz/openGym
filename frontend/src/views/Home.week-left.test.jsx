// @vitest-environment happy-dom
// #753: Home counts the week's plan down, "2 of 4 left this week", and cheers when it is done.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { todayISO, isoOf } from '../lib/format.js'
import Home from './Home.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), bwSheet: vi.fn(), goalSheet: vi.fn(), dayOverrideSheet: vi.fn(),
  calendarSheet: vi.fn(), startFlow: vi.fn(), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllEnvs() })

const routines = [{ id: 'A', name: 'Push', ex: [] }, { id: 'B', name: 'Pull', ex: [] }]
const mountWith = (patch, View = Home, store = useStore) => {
  store.setState(s => ({ S: { ...s.S, routines, workouts: [], bodyweight: [], dayPlan: {}, week: {}, active: null, queue: null, rotation: null, scheduleMode: null, weekStart: 1, ...patch }, user: null }))
  act(() => root.render(<View />))
}
const line = () => host.querySelector('.wkleft')?.textContent

describe('workouts left this week on Home (#753)', () => {
  it('counts the planned days down', () => {
    mountWith({ week: { 1: ['A'], 2: ['B'], 4: ['A'], 6: ['B'] } })
    expect(line()).toBe('4 of 4 left this week')
  })
  it('says so when the week is done', () => {
    mountWith({ week: { 1: ['A'] }, workouts: [{ id: 'w', d: todayISO(), start: Date.now(), name: 'Push', routineIds: ['A'], entries: [] }] })
    expect(line()).toBe('All done this week. Nice.')
  })
  it('says nothing without a plan', () => {
    mountWith({})
    expect(line()).toBeUndefined()
  })
  it('marks the Personal weekly goal met and leaves the next rotation routine available', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_PERSONAL', '1')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T12:00:00'))
    const { default: PersonalHome } = await import('./Home.jsx')
    const { useStore: personalStore } = await import('../store/useStore.js')
    const ids = ['A', 'B', 'C']
    const entries = [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }]
    mountWith({
      routines: [...routines, { id: 'C', name: 'Legs', ex: [] }],
      workouts: [
        { id: 'wA', d: '2026-10-26', name: 'Push', routineIds: ['A'], entries },
        { id: 'wB', d: '2026-10-28', name: 'Pull', routineIds: ['B'], entries },
      ],
      weekTarget: 2,
      rotation: { id: 'rot', sequence: ids, label: '' },
      queue: { ids, startsOn: '2026-10-26', rotationId: 'rot' },
    }, PersonalHome, personalStore)

    expect(line()).toContain('2 of 2 strength workouts this week')
    expect(line()).toContain('Extra workouts are optional')
    expect(host.querySelector('.queue .chip.on').textContent).toContain('Legs')
    expect(host.querySelector('.queue .chip.on').disabled).toBe(false)
  })
})
void isoOf
