// Workouts left this week (#753, thanks @unabomberlive): "2 of 4 left this week" on Home and in
// the widget snapshot, so the week's plan reads as a countdown and not only as a tally.
//
//  - Fixed week (and a planner's coach week): the streak card's own fraction (queue.js
//    weekTally), planned minus done, so the two lines never disagree.
//  - Rotation: a loop runs by order, not by weekday, so it has no week of its own. With a target
//    set (Settings → Plan & schedule → Workouts per week, S.weekTarget, 1 to 7) it is that target
//    minus this calendar week's workouts; with none, nothing is said (the loop's own progress row
//    already shows where it stands). Personal counts only logged strength workouts through today.
//
//  - Today's planned routine still open keeps at least one left: extra workouts earlier in the
//    week can reach the planned count, but "All done this week" over a Friday whose Legs is
//    still waiting reads wrong (QA2 1.4.5). Open = not named by a workout logged today, the rule
//    Home's Today row uses.
//
// Nothing is stored here; null means "nothing to say" (no plan, or no target).
import { weekTally, queueOf } from './queue.js'
import { scheduleModeOf } from './rotation.js'
import { weekKey, weekStartOf, todayISO } from './format.js'
import { effectiveRoutineIds } from './history.js'
import { exerciseOf } from './exercises.js'
import { hasCompletedWork, isWarmupRow, modeForSet } from './workout-model.js'
import { PERSONAL } from './personal.js'

export const WEEK_TARGET_MAX = 7

/** The rotation's weekly target, 1 to 7, or null when none is set. */
export function weekTargetOf(S) {
  const n = Math.round(Number(S?.weekTarget))
  return n >= 1 && n <= WEEK_TARGET_MAX ? n : null
}

const STRENGTH_TYPES = new Set(['strength', 'calisthenics', 'olympic', 'plyometrics', 'isometric'])

function hasStrengthWork(workout) {
  return Array.isArray(workout.entries) && workout.entries.some(entry => {
    if (!Array.isArray(entry?.sets)) return false
    const exercise = exerciseOf(entry.id)
    if (exercise?.bp === 'cardio' || (exercise?.cat && !STRENGTH_TYPES.has(exercise.cat))) return false
    return entry.sets.some(set => hasCompletedWork(set) && !isWarmupRow(set)
      && modeForSet(set, entry.target || entry) !== 'cardio')
  })
}

/** Weekly progress, marked `kind: 'strength'` for Personal rotation goals, or null without a goal. */
export function workoutsLeft(S, today = todayISO()) {
  if (!S) return null
  const st = { ...S, routines: S.routines || [], workouts: S.workouts || [], week: S.week || {} }
  const q = queueOf(st)
  const managed = !!q && !!st.rotation && q.rotationId === st.rotation.id
  if (scheduleModeOf(st) === 'rotation' && (managed || !q)) {
    const of = weekTargetOf(st)
    if (!of) return null
    const ws = weekStartOf(st)
    const wk = weekKey(today, ws)
    const done = st.workouts.filter(w => w && weekKey(w.d, ws) === wk
      && (!PERSONAL || (w.d <= today && hasStrengthWork(w)))).length
    return { left: Math.max(0, of - done), of, done, ...(PERSONAL ? { kind: 'strength' } : {}) }
  }
  let tally
  try { tally = weekTally(st, today) } catch { return null }
  if (!(tally?.planned > 0)) return null
  const left = Math.max(0, tally.planned - tally.done, todayOpen(st, today) ? 1 : 0)
  return { left, of: tally.planned, done: tally.done }
}

// Whether today has a planned routine that no workout logged today covers. A coach week's session
// is never covered by another workout (the queue only names one it does not count as done yet).
function todayOpen(S, today) {
  let ids
  try { ids = effectiveRoutineIds({ dayPlan: {}, ...S }, today, today) } catch { return false }
  if (!ids.length) return false
  const queueIds = queueOf(S)?.ids || []
  const logged = S.workouts.filter(w => w && w.d === today)
  const covered = id => !queueIds.includes(id) && logged.some(w => (Array.isArray(w.routineIds) ? w.routineIds : [w.routineId]).includes(id))
  return !ids.every(covered)
}
