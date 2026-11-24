import { EXIDX, isCardio, isDistanceEx, isHold } from './exercises.js'
import { todayISO } from './format.js'
import { mergePlan } from './plan-share.js'
import { saveRotation } from './rotation.js'
import { estimateMinutes } from './session-builder.js'

const NAMES = ['A', 'B', 'C']
const MAX_RESPONSE_LENGTH = 16_000
const MAX_CUE_LENGTH = 160
const MAX_EXERCISES = 8
const MAX_WORK_SETS = 20
const EXERCISE_FIELDS = ['id', 'sets', 'repsMin', 'repsMax', 'restSec', 'note']
const invalidDraft = () => new Error('Invalid routine draft.')

const hasFields = (value, fields) => value != null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key))
const integerBetween = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

/** Read the proposed A/B/C workouts as rep-based OpenGym slots, or throw a safe review error. */
export function parseRoutineDraft(text, allowedExercises, profile) {
  if (typeof text !== 'string' || text.length > MAX_RESPONSE_LENGTH || !Array.isArray(allowedExercises) ||
      !integerBetween(profile?.sessionMinutes, 15, 180)) throw invalidDraft()

  const input = text.trim()
  const fenced = /^```json[^\S\r\n]*\r?\n([\s\S]+)\r?\n```$/i.exec(input)
  let payload
  try {
    payload = JSON.parse(fenced?.[1] ?? input)
  } catch {
    throw invalidDraft()
  }
  if (!hasFields(payload, ['routines']) || !Array.isArray(payload.routines) || payload.routines.length !== NAMES.length) {
    throw invalidDraft()
  }

  const allowedIds = new Set(allowedExercises.map(e => e?.id))
  const routines = new Map()
  for (const routine of payload.routines) {
    if (!hasFields(routine, ['name', 'exercises']) || !NAMES.includes(routine.name) || routines.has(routine.name) ||
        !Array.isArray(routine.exercises) || !integerBetween(routine.exercises.length, 1, MAX_EXERCISES)) throw invalidDraft()

    const seen = new Set()
    const ex = routine.exercises.map(slot => {
      if (!hasFields(slot, EXERCISE_FIELDS)) throw invalidDraft()
      const { id, sets, repsMin, repsMax, restSec, note } = slot
      const exercise = typeof id === 'string' && Object.hasOwn(EXIDX, id) ? EXIDX[id] : null
      if (!allowedIds.has(id) || exercise?.id !== id || seen.has(id) || isCardio(exercise) ||
          isHold(exercise) || isDistanceEx(exercise)) throw invalidDraft()
      if (!integerBetween(sets, 1, 5) || !integerBetween(repsMin, 1, 30) || !integerBetween(repsMax, repsMin, 30) ||
          !integerBetween(restSec, 30, 300) || typeof note !== 'string' || note.length > MAX_CUE_LENGTH ||
          /[<>\p{Cc}\p{Cf}\u2028\u2029]/u.test(note)) throw invalidDraft()

      seen.add(id)
      return { id, sets, mode: 'reps', reps: repsMax, repsMin, restSec, note: note.trim() }
    })

    const minutes = estimateMinutes(ex)
    const workSets = ex.reduce((total, slot) => total + slot.sets, 0)
    // Keep the session builder's three-minute allowance for rough work/rest estimates.
    if (workSets > MAX_WORK_SETS || minutes > profile.sessionMinutes + 3) throw invalidDraft()
    routines.set(routine.name, { name: routine.name, ex, minutes })
  }
  return { routines: NAMES.map(name => routines.get(name)) }
}

/** A new rotation cannot claim a schedule the user is already using. */
export function canStartDraftRotation(s) {
  if (!s || s.active || s.queue != null || s.rotation != null || s.programme != null) return false
  const today = todayISO()
  return !Object.values(s.week || {}).some(ids => [].concat(ids).some(Boolean)) &&
    !Object.entries(s.dayPlan || {}).some(([date, id]) => date >= today && !!id)
}

/** Add the reviewed draft within store.update. Recheck rotation availability when saving. */
export function saveRoutineDraft(s, draft, { useRotation = false } = {}) {
  const existingNames = new Set((s.routines || []).map(r => (r?.name || '').toLowerCase()))
  const routines = draft.routines.map(routine => {
    const baseName = `Personal draft ${routine.name}`
    let name = baseName
    for (let suffix = 2; existingNames.has(name.toLowerCase()); suffix++) name = `${baseName} (${suffix})`
    return { id: routine.name, name, emoji: 'figureStrength', ex: routine.ex }
  })

  s.routines ||= []
  const { ids } = mergePlan(s, { routines }, { schedule: false })
  const rotationStarted = useRotation === true && canStartDraftRotation(s)
  if (rotationStarted) {
    saveRotation(s, ids, 'Personal A/B/C')
    s.scheduleMode = 'rotation'
  }
  return { ids, rotationStarted }
}
