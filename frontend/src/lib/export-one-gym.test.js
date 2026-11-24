import { describe, expect, it } from 'vitest'
import { oneGymCSV } from './export-one-gym.js'
import { parseImportFile } from './import-apps.js'
import { parseCSV } from './import-csv.js'

const header = 'Day,Exercise,Sets,Reps/Time,Weight,Notes,Form Guidance,Muscle Group,Main Muscle'
const bench = { id: '0025', sets: 3, repsMin: 8, reps: 12, weight: 20.4117 }
const squat = { id: '0043', sets: 4, reps: 5, weight: 0 }
const plank = { id: '0463', sets: 2, mode: 'time', sec: 45 }
const lower = { id: 'lower', name: 'Lower', ex: [squat] }
const upper = { id: 'upper', name: 'Upper', ex: [bench, plank] }

describe('One Gym routine CSV export', () => {
  it('exports the active rotation in order and appends unassigned routines without touching history', () => {
    const state = {
      unit: 'kg', scheduleMode: 'rotation', workouts: [{ d: '2026-01-01', name: 'Private past workout' }],
      routines: [lower, upper, { id: 'unused', name: 'Accessory', ex: [plank] }, { id: 'empty', name: 'Empty', ex: [] }],
      rotation: { id: 'loop', sequence: ['upper', 'rest', 'lower'] },
      queue: { rotationId: 'loop', ids: ['lower'], startsOn: '2026-01-01' },
    }
    const before = structuredClone(state)
    const content = oneGymCSV(state)
    const parsed = parseImportFile(content)
    expect(content.split('\r\n')[0]).toBe(header)
    expect(parsed.routines.routines.map(day => [day.name, day.ex.map(ex => ex.id)])).toEqual([
      ['Upper', ['0025', '0463']], ['Lower', ['0043']], ['Accessory', ['0463']],
    ])
    expect(content).not.toContain('Private past workout')
    expect(state).toEqual(before)
  })

  it('exports pinned and profile units, leaves an unknown load blank and marks bodyweight', () => {
    const state = { unit: 'kg', routines: [upper, lower], exUnit: { '0025': { unit: 'lb' } } }
    const [, lift, hold, missing] = parseCSV(oneGymCSV(state))
    expect(lift.slice(2, 5)).toEqual(['3', '8-12', '45lb'])
    expect(hold.slice(2, 5)).toEqual(['2', '45s', 'BW'])
    expect(missing[4]).toBe('')
    state.exUnit = {}
    expect(parseCSV(oneGymCSV(state))[1][4]).toBe('20.4117kg')
  })

  it('quotes text and flattens newlines so One Gym can parse each exercise on one line', () => {
    const note = '1 second down, then use a "soft" lockout.\nReset your grip.'
    const state = { routines: [{ id: 'mix', name: 'Mixed\nday', ex: [{ ...bench, note }] }] }
    const cue = 'Drive both feet into the floor.\r\nExhale, then reset.'
    const content = oneGymCSV(state, { '0025': [cue] })
    expect(content.split('\r\n')).toHaveLength(3)
    expect(content).toContain('"soft"" lockout.')
    expect(parseCSV(content)[1].slice(0, 9)).toEqual([
      'Mixed · day', 'Barbell Bench Press', '3', '8-12', '20.4117kg',
      '1 second down, then use a "soft" lockout. · Reset your grip.',
      'Drive both feet into the floor. · Exhale, then reset.', 'Chest', 'Pectorals',
    ])
  })

  it('keeps distinct labels for repeated days and exercise names within a day', () => {
    const state = {
      scheduleMode: 'rotation', rotation: { sequence: ['upper', 'lower', 'upper'] },
      routines: [{ ...upper, ex: [bench, bench] }, { ...lower, name: 'Upper (2)' }],
    }
    expect(parseCSV(oneGymCSV(state)).slice(1).map(r => r.slice(0, 2))).toEqual([
      ['Upper', 'Barbell Bench Press'], ['Upper', 'Barbell Bench Press (2)'],
      ['Upper (2)', 'Barbell Full Squat'],
      ['Upper (3)', 'Barbell Bench Press'], ['Upper (3)', 'Barbell Bench Press (2)'],
    ])
  })

  it('keeps the configured weights and reps of varied sets in their notes', () => {
    const state = { unit: 'lb', routines: [{ ...upper, ex: [{ ...bench, pyramid: [12, 10, 8], pyramidWeight: [30, 35, 40] }] }] }
    const [, row] = parseCSV(oneGymCSV(state))
    expect(row.slice(2, 5)).toEqual(['3', '12', '30lb'])
    expect(row[5]).toContain('12 reps at 30lb, 10 reps at 35lb, 8 reps at 40lb')
  })
})
