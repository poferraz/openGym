import { ALL_EQUIPMENT } from './equipment.js'
import { CATALOGUE, EXIDX, everydayScore, isCardio, isDistanceEx, isHold } from './exercises.js'
import { todayISO, capWords } from './format.js'
import { modeOf } from './history.js'
import { isWarmupRow, isSideSet } from './workout-model.js'

export const TRAINING_PROFILE_LIMIT = 8192
export const TRAINING_EXPERIENCE = ['new', 'returning', 'regular']
export const PERSONAL_EQUIPMENT = ALL_EQUIPMENT.filter(name => CATALOGUE.some(e => e.eq === name))
export const DEFAULT_OLLAMA_MODEL = 'kimi-k3.1-pro'
export const FAST_OLLAMA_MODEL = 'deepseek-v4.1-flash:1017'
const FULL_GYM = ['body weight', 'dumbbell', 'barbell', 'cable', 'leverage machine', 'sled machine', 'smith machine', 'kettlebell', 'band', 'ez barbell', 'assisted']
const TRAINING_PREFERENCES = 'Build a flexible full-body A/B/C rotation. Start conservatively with about two working sets, mostly 8–15 reps and 2–4 reps in reserve. Add reps before increasing load. Keep lower-body training low-impact, controlled and in a comfortable range. Prefer supported options if needed and leave starting loads open. Include simple core work. Walking or easy pool work can stay separate.'

export function defaultTrainingProfile(saved) {
  const profile = normalizeTrainingProfile(saved)
  if (profile) return { ...profile, equipment: profile.equipmentMode === 'custom' ? profile.equipment : [...FULL_GYM] }
  return {
    goal: 'Build or preserve muscle, improve body composition and train consistently.',
    experience: 'returning', weeklySessions: 2, optionalSession: true, sessionMinutes: 45,
    equipment: [...FULL_GYM], preferences: TRAINING_PREFERENCES, constraints: '', recovery: '',
  }
}

const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const between = (n, low, high) => Number.isInteger(n) && n >= low && n <= high

export function normalizeTrainingProfile(raw) {
  const { goal, experience, weeklySessions, optionalSession, sessionMinutes, equipment, equipmentMode, preferences, constraints, recovery } = raw || {}
  const selected = Array.isArray(equipment) ? [...new Set(equipment.filter(e => PERSONAL_EQUIPMENT.includes(e)))].slice(0, 20) : []
  const cleanGoal = text(goal, 120)
  if (!cleanGoal || !TRAINING_EXPERIENCE.includes(experience) || !selected.length ||
      !between(weeklySessions, 1, 7) || !between(sessionMinutes, 15, 180)) return null
  return {
    goal: cleanGoal, experience, weeklySessions, optionalSession: weeklySessions < 7 && optionalSession === true,
    sessionMinutes, equipment: selected, ...(equipmentMode === 'custom' ? { equipmentMode } : {}),
    preferences: text(preferences, 600), constraints: text(constraints, 500), recovery: text(recovery, 500),
  }
}

export function parseTrainingProfile(source) {
  if (source.length > TRAINING_PROFILE_LIMIT) throw new Error('Training profile is too large.')
  const input = JSON.parse(source)
  const profile = input?.openGymTrainingProfile === 1 && normalizeTrainingProfile(input.profile)
  if (!profile) throw new Error('Training profile is incomplete or invalid.')
  return profile
}

function exerciseChoices(routines, equipment) {
  const available = new Set(equipment)
  const choices = new Map(), counts = new Map()
  const eligible = e => !!e && !e.custom && available.has(e.eq) && !isCardio(e) && !isHold(e) && !isDistanceEx(e) && !e.side &&
    (!e.cat || e.cat === 'strength' || e.cat === 'calisthenics') && !/\b(jump\w*|burpees?|hops?)\b/i.test(e.n)
  const add = e => {
    if (!eligible(e) || choices.has(e.id) || choices.size >= 80) return
    choices.set(e.id, { id: e.id, name: capWords(e.n).slice(0, 120), equipment: e.eq, muscle: (e.tg || e.bp).slice(0, 80) })
  }
  // Keep exercises already in the plan near the top, then cover different muscle groups and equipment.
  for (const routine of routines || []) for (const entry of routine.ex || []) {
    if (choices.size < 18 && modeOf(entry) === 'reps' && !entry.side) add(EXIDX[entry.id])
  }
  const familiar = CATALOGUE.filter(eligible).map(exercise => ({ exercise, score: everydayScore(exercise) }))
    .sort((a, b) => b.score - a.score)
  for (const { exercise: e } of familiar) {
    if (choices.has(e.id)) continue
    const group = `${e.bp}/${e.eq}`
    const count = counts.get(group) || 0
    if (count >= 2) continue
    add(e)
    counts.set(group, count + 1)
    if (choices.size >= 80) break
  }
  return [...choices.values()]
}

function latestWorkSets(state, exercises, today) {
  const allowed = new Set(exercises.map(e => e.id))
  const samples = new Map()
  const workouts = (state.workouts || []).filter(w => typeof w.d === 'string' && w.d <= today)
    .sort((a, b) => b.d.localeCompare(a.d) || (b.start || 0) - (a.start || 0))
  for (const workout of workouts) {
    for (const entry of workout.entries || []) {
      if (!allowed.has(entry.id) || samples.has(entry.id) || modeOf(entry.target || entry) !== 'reps') continue
      const work = (entry.sets || []).findLast(set => set?.done === true && !isWarmupRow(set) && !isSideSet(set) && between(set.r, 1, 1000))
      if (!work) continue
      const unit = state.unit === 'lb' ? 'lb' : 'kg'
      const weight = Number.isFinite(work.w) && work.w > 0 && work.w <= 2000 ? { weight: work.w } : {}
      samples.set(entry.id, { id: entry.id, reps: work.r, ...weight, unit })
      if (samples.size === 16) return [...samples.values()]
    }
  }
  return [...samples.values()]
}

export function prepareCoachRequest(state, profile, model, share = {}, today = todayISO()) {
  const { goal, experience, weeklySessions, optionalSession, sessionMinutes, equipment, preferences, constraints, recovery } = profile
  const exercises = exerciseChoices(state.routines, equipment)
  const brief = text(share.brief, 300)
  return {
    model: text(model, 100),
    ...(brief ? { brief } : {}),
    profile: {
      goal, experience, weeklySessions, optionalSession, sessionMinutes, equipment, preferences,
      ...(share.constraints && constraints ? { constraints } : {}),
      ...(share.recovery && recovery ? { recovery } : {}),
      ...(share.recentPerformance ? { recentPerformance: latestWorkSets(state, exercises, today) } : {}),
    },
    exercises,
  }
}
