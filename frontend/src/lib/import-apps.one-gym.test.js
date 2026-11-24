import { describe, expect, it } from 'vitest'
import { freshRoutines, mergeImportedRoutines, parseImportFile } from './import-apps.js'

const HEADER = 'Day,Exercise,Sets,Reps/Time,Weight,Notes,Form Guidance,Muscle Group,Main Muscle'
const CSV = [
  HEADER,
  'Upper,Bench Press (Barbell),3,8–12,100lb,"Pause, then press","Brace\r\nKeep both feet down",Chest,Pecs',
  'Lower,Squat,4,5,40kg,,,Legs,Quads',
  'Upper,Plank,2,45s,BW,,,Core,Abs',
].join('\r\n')

describe('One Gym routine CSV', () => {
  it('preserves the order of days and exercises and maps load, reps, holds and guidance', () => {
    const parsed = parseImportFile('\ufeff' + CSV, { unit: 'kg' })
    expect(parsed.source).toBe('One Gym')
    expect(parsed.workouts).toEqual([])
    expect(parsed.routines.routines.map(r => r.name)).toEqual(['Upper', 'Lower'])
    const [upper, lower] = parsed.routines.routines
    expect(upper.ex).toMatchObject([
      { id: '0025', sets: 3, mode: 'reps', reps: 12, repsMin: 8, weight: 45.36, note: 'Pause, then press\nBrace\nKeep both feet down' },
      { id: '0463', sets: 2, mode: 'time', sec: 45, weight: 0, bodyweight: true },
    ])
    expect(lower.ex).toMatchObject([{ id: '0043', sets: 4, mode: 'reps', reps: 5, weight: 40 }])
  })

  it('reinterprets unitless weights using the selected source unit and keeps explicit units', () => {
    const text = [HEADER, 'Full Body,Squat,4,5,100,,,,', 'Full Body,Bench Press,3,8,40kg,,,,'].join('\n')
    const parse = opts => parseImportFile(text, { unit: 'kg', ...opts }).routines.routines[0].ex.map(x => x.weight)
    expect(parse({})).toEqual([100, 40])
    expect(parse({ oneGymSourceUnit: 'lb' })).toEqual([45.36, 40])
  })

  it('adds new routines without touching history or replacing an edited routine on reimport', () => {
    const state = { workouts: [{ id: 'existing', d: '2026-01-01' }], routines: [], customEx: [] }
    const plan = parseImportFile(CSV).routines
    expect(mergeImportedRoutines(state, plan)).toEqual({ added: 2, skipped: 0 })
    state.routines[0].ex[0].note = 'Personal note'
    expect(freshRoutines(state, plan)).toBe(0)
    expect(mergeImportedRoutines(state, plan)).toEqual({ added: 0, skipped: 2 })
    expect(state.routines[0].ex[0].note).toBe('Personal note')
    expect(state.workouts).toEqual([{ id: 'existing', d: '2026-01-01' }])
  })

  it('supports exercise preview choices while keeping skipped exercises available to select again', () => {
    const parsed = parseImportFile(CSV, { notes: false, skip: new Set(['plank']), matches: new Map([['squat', null]]) })
    expect(parsed.routines.routines[0].ex).toHaveLength(1)
    expect(parsed.routines.routines[0].ex[0]).not.toHaveProperty('note')
    expect(parsed.routines.customEx).toMatchObject([{ n: 'squat', bp: 'upper legs' }])
    expect(parsed.routines.names.map(x => x.key)).toEqual(['bench press (barbell)', 'squat', 'plank'])
  })

  it('reports unreadable rows and rejects a file with no importable prescriptions', () => {
    const malformed = ['Upper,Bench Press,2x,8,20kg,,,,', 'Recovery,Rest,0,,,,,,', 'Lower,Squat,2,8,unknown,,,,']
    expect(parseImportFile([HEADER, ...malformed].join('\n'))).toEqual({ error: 'format', app: 'One Gym' })
    const partial = parseImportFile([HEADER, ...malformed, 'Core,Plank,2,1:15,BW,,,,'].join('\n'))
    expect(partial.skipped).toBe(3)
    expect(partial.routines.routines[0].ex[0]).toMatchObject({ sec: 75 })
  })
})
