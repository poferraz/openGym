import { describe, expect, it } from 'vitest'
import { canStartDraftRotation, parseRoutineDraft, saveRoutineDraft } from './personal-routine-draft.js'

const BENCH = '0025', ROW = '0027', SQUAT = '0043', RAISE = '0334', PLANK = '0463'
const allowed = [
  { id: BENCH, name: 'Barbell bench press', equipment: 'barbell', muscle: 'chest' },
  { id: ROW, name: 'Barbell bent over row', equipment: 'barbell', muscle: 'back' },
  { id: SQUAT, name: 'Barbell full squat', equipment: 'barbell', muscle: 'quadriceps' },
  { id: RAISE, name: 'Dumbbell lateral raise', equipment: 'dumbbell', muscle: 'shoulders' },
]
const exercise = (id, patch = {}) => ({ id, sets: 3, repsMin: 8, repsMax: 12, restSec: 90, note: 'Move with control.', ...patch })
const payload = () => ({ routines: [
  { name: 'C', exercises: [exercise(SQUAT)] },
  { name: 'A', exercises: [exercise(BENCH)] },
  { name: 'B', exercises: [exercise(ROW)] },
] })
const parse = (data = payload(), sessionMinutes = 40, exercises = allowed) => (
  parseRoutineDraft(JSON.stringify(data), exercises, { sessionMinutes })
)

describe('parseRoutineDraft', () => {
  it('makes a reviewable A/B/C draft with OpenGym rep config and an estimated duration', () => {
    const draft = parse()
    expect(draft.routines.map(r => r.name)).toEqual(['A', 'B', 'C'])
    expect(draft.routines[0]).toEqual({
      name: 'A', minutes: 7, ex: [
        { id: BENCH, sets: 3, mode: 'reps', reps: 12, repsMin: 8, restSec: 90, note: 'Move with control.' },
      ],
    })
  })

  it('accepts a single fenced JSON block with a fixed rep target', () => {
    const data = payload()
    data.routines[1].exercises[0].repsMin = 12
    const draft = parseRoutineDraft(`\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n`, allowed, { sessionMinutes: 40 })
    expect(draft.routines[0].ex[0]).toMatchObject({ reps: 12, repsMin: 12 })
  })

  it('rejects surrounding prose, multiple fences, and truncated JSON without echoing the input', () => {
    const json = JSON.stringify(payload())
    for (const text of [`private text ${json}`, `\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``, json.slice(0, -1)]) {
      expect(() => parseRoutineDraft(text, allowed, { sessionMinutes: 40 })).toThrow('Invalid routine draft.')
    }
  })

  it.each([
    ['duplicate routine', data => { data.routines[0].name = 'A' }],
    ['missing routine', data => { data.routines.pop() }],
    ['unsupported routine name', data => { data.routines[0].name = 'D' }],
    ['empty routine', data => { data.routines[0].exercises = [] }],
    ['duplicate exercise', data => { data.routines[0].exercises.push(exercise(SQUAT)) }],
    ['duplicate-lookalike exercise ID', data => { data.routines[0].exercises[0].id = 43 }],
    ['exercise outside the provided catalog', data => { data.routines[0].exercises[0].id = '0861' }],
    ['an unexpected plan field', data => { data.week = { 1: ['A'] } }],
    ['an unexpected routine field', data => { data.routines[0].emoji = 'test' }],
    ['a model-supplied weight', data => { data.routines[0].exercises[0].weight = 100 }],
    ['a missing cue', data => { delete data.routines[0].exercises[0].note }],
  ])('rejects %s', (_, change) => {
    const data = payload()
    change(data)
    expect(() => parse(data)).toThrow('Invalid routine draft.')
  })

  it('checks the local catalog even if the supplied list accidentally includes a fictional ID or a static hold', () => {
    for (const id of ['not-a-real-id', PLANK]) {
      const data = payload()
      data.routines[0].exercises[0].id = id
      expect(() => parse(data, 40, [...allowed, { id, name: 'Other', equipment: 'unknown', muscle: 'other' }])).toThrow()
    }
  })

  it.each([
    [ { sets: 0 } ], [ { sets: 6 } ], [ { sets: 2.5 } ], [ { sets: '3' } ],
    [ { repsMin: 15 } ], [ { repsMax: 31 } ], [ { repsMin: 0 } ],
    [ { restSec: 0 } ], [ { restSec: 301 } ],
    [ { note: '<a href="https://example.com">Open</a>' } ], [ { note: 'a\nb' } ], [ { note: 'a'.repeat(161) } ],
  ])('rejects an invalid exercise config %o', patch => {
    const data = payload()
    Object.assign(data.routines[0].exercises[0], patch)
    expect(() => parse(data)).toThrow()
  })

  it('rejects working volume that does not fit the requested session length', () => {
    const data = payload()
    data.routines[1].exercises = [BENCH, ROW, RAISE].map(id => exercise(id, { sets: 4, repsMax: 15, restSec: 180 }))
    expect(() => parse(data, 20)).toThrow()
    expect(parse(data, 50).routines[0].minutes).toBe(44)
  })

  it('accepts the longest supported training session', () => {
    expect(parse(payload(), 180).routines).toHaveLength(3)
  })

  it('rejects excessive sets even when a long session could technically fit them', () => {
    const extra = { id: '0861', name: 'Cable seated row', equipment: 'cable', muscle: 'back' }
    const data = payload()
    data.routines[1].exercises = [...allowed, extra].map(({ id }) => exercise(id, { sets: 5 }))
    expect(() => parse(data, 180, [...allowed, extra])).toThrow()
  })
})

describe('saveRoutineDraft', () => {
  const state = (extra = {}) => ({ routines: [], workouts: [], active: null, week: {}, dayPlan: {}, queue: null, rotation: null, ...extra })

  it('adds separately named routines without overwriting a name, active workout, or history', () => {
    const current = { id: 'mine', name: 'Personal draft A', ex: [] }
    const active = { id: 'active', entries: [] }
    const workouts = [{ id: 'logged', entries: [] }]
    const s = state({ routines: [current], active, workouts })
    const result = saveRoutineDraft(s, parse())
    expect(result).toEqual({ ids: s.routines.slice(1).map(r => r.id), rotationStarted: false })
    expect(new Set(s.routines.map(r => r.id)).size).toBe(4)
    expect(s.routines[0]).toBe(current)
    expect(s.routines.slice(1).map(r => r.name)).toEqual(['Personal draft A (2)', 'Personal draft B', 'Personal draft C'])
    expect(s.routines[1].ex[0]).toMatchObject({ id: BENCH, reps: 12, repsMin: 8, note: 'Move with control.' })
    expect(s.routines[1].ex[0]).not.toHaveProperty('weight')
    expect(s.active).toBe(active)
    expect(s.workouts).toBe(workouts)
    expect(s.queue).toBeNull()
    expect(s.rotation).toBeNull()
  })

  it('starts a rotation with the new IDs after an explicit opt-in on a free schedule', () => {
    const s = state({ dayPlan: { '2000-01-01': 'past' } })
    expect(canStartDraftRotation(s)).toBe(true)
    const result = saveRoutineDraft(s, parse(), { useRotation: true })
    expect(result.rotationStarted).toBe(true)
    expect(s.queue.ids).toEqual(result.ids)
    expect(s.rotation.sequence).toEqual(result.ids)
    expect(s.scheduleMode).toBe('rotation')
    expect(s.dayPlan).toEqual({ '2000-01-01': 'past' })
  })

  it.each([
    ['active workout', { active: { id: 'a' } }],
    ['queue', { queue: { ids: ['mine'] } }],
    ['saved rotation', { rotation: { sequence: ['mine'] } }],
    ['weekday schedule', { week: { 1: 'mine' } }],
    ['date override', { dayPlan: { '2999-08-31': 'rest' } }],
    ['paused programme', { programme: { id: 'mine', pausedOn: '2000-01-01' } }],
  ])('saves the routines without disturbing an existing %s', (_, occupied) => {
    const s = state(occupied)
    expect(canStartDraftRotation(s)).toBe(false)
    expect(saveRoutineDraft(s, parse(), { useRotation: true }).rotationStarted).toBe(false)
    expect(s).toMatchObject(occupied)
    expect(s.routines).toHaveLength(3)
  })
})
