// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importFromApp } from './sheets.jsx'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'

const csv = 'Day,Exercise,Sets,Reps/Time,Weight\nPush,Bench Press,3,8,40kg\nPull,Lat Pulldown,3,12,40kg'
let host, root

async function preview() {
  importFromApp(new File([csv], 'routine.csv', { type: 'text/csv' }))
  for (let i = 0; i < 50 && !useUI.getState().sheets.length; i++) await new Promise(resolve => setTimeout(resolve, 5))
  const sheet = useUI.getState().sheets.at(-1)
  expect(sheet).toBeTruthy()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(sheet.render(() => {})))
}

const rotationChoice = () => host.querySelector('[role="checkbox"][aria-label="Use these routines as my rotation"]')
const confirmImport = () => act(() => [...host.querySelectorAll('button')].find(button => button.textContent === 'Import').click())

describe('the One Gym import preview', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toasts: [], toastMsg: '' })
    useStore.setState(s => ({ S: { ...s.S, unit: 'kg', workouts: [], routines: [], customEx: [], scheduleMode: 'rotation', rotation: null, queue: null } }))
  })
  afterEach(() => {
    if (root) act(() => root.unmount())
    root = null
    if (host) host.remove()
  })

  it('starts an empty rotation in file order only when the preview choice is checked', async () => {
    await preview()
    expect(host.textContent).toContain('Push')
    expect(host.textContent).toContain('Pull')
    expect(useStore.getState().S.routines).toEqual([])
    expect(rotationChoice()?.getAttribute('aria-checked')).toBe('false')
    act(() => rotationChoice().click())
    confirmImport()
    const s = useStore.getState().S
    expect(s.routines.map(x => x.name)).toEqual(['Push', 'Pull'])
    expect(s.queue.ids).toEqual(s.routines.map(x => x.id))
    expect(s.rotation.sequence).toEqual(s.queue.ids)
  })

  it('adds routines without offering to replace an existing rotation', async () => {
    const queue = { ids: ['existing'], since: 1, startsOn: '2026-01-01', rotationId: 'loop' }
    useStore.setState(s => ({ S: { ...s.S, routines: [{ id: 'existing', name: 'Existing', ex: [] }], queue, rotation: { id: 'loop', sequence: ['existing'], label: 'My loop' } } }))
    await preview()
    expect(rotationChoice()).toBeNull()
    confirmImport()
    const s = useStore.getState().S
    expect(s.routines.map(x => x.name)).toEqual(['Existing', 'Push', 'Pull'])
    expect(s.queue).toEqual(queue)
  })

  it('disables import when every exercise is unticked and lets the selection be restored', async () => {
    await preview()
    act(() => host.querySelector('.imp-choices-h').click())
    const button = label => [...host.querySelectorAll('button')].find(x => x.textContent === label)
    act(() => button('Select none').click())
    expect(button('Nothing new to import').disabled).toBe(true)
    expect(rotationChoice()).toBeNull()
    expect(useStore.getState().S.routines).toHaveLength(0)
    act(() => button('Select all').click())
    expect(button('Import').disabled).toBe(false)
  })
})
