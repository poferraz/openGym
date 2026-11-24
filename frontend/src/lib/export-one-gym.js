import { shownNameOf } from './exercise-aliases.js'
import { EXIDX, isBodyweightEq } from './exercises.js'
import { exUnitOf, viewTarget } from './ex-unit.js'
import { csvField } from './export-csv.js'
import { capWords, weekOrder, weekStartOf } from './format.js'
import { modeOf } from './history.js'
import { isPyramid, PYRAMID_MAX } from './pyramid.js'
import { queueOf } from './queue.js'
import { scheduleModeOf, sequenceOf } from './rotation.js'

const HEADER = 'Day,Exercise,Sets,Reps/Time,Weight,Notes,Form Guidance,Muscle Group,Main Muscle'
const GROUPS = new Map([['waist', 'Core'], ['upper arms', 'Arms'], ['lower arms', 'Forearms'], ['upper legs', 'Legs'], ['lower legs', 'Calves']])
const positive = n => Number.isFinite(n) && n > 0
const decimal = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 6 })
const load = (n, unit) => (positive(n) ? `${decimal.format(n)}${unit}` : '')

// One Gym splits the file into lines before it decodes quoted cells.
const flat = value => String(value ?? '').trim().replace(/\s*[\r\n]+\s*/g, ' · ')

function uniqueLabels(labels) {
  const reserved = new Set(labels), used = new Set()
  return labels.map(label => {
    let name = label
    if (used.has(name)) {
      let n = 2
      do { name = `${label} (${n++})` } while (reserved.has(name) || used.has(name))
    }
    used.add(name)
    return name
  })
}

function exportOrder(S, routines) {
  const queue = queueOf(S)
  const sequence = sequenceOf(S)
  const ownQueue = S.rotation && queue?.rotationId === S.rotation.id
  const ids = scheduleModeOf(S) === 'rotation'
    ? (queue && (!ownQueue || !sequence.length) ? queue.ids : sequence)
    : weekOrder(weekStartOf(S)).flatMap(day => S.week?.[day] || [])
  const byId = new Map(routines.map(r => [r.id, r])), assigned = new Set(ids)
  return [...ids.map(id => byId.get(id)).filter(Boolean), ...routines.filter(r => !assigned.has(r.id))]
}

function repsTime(config, mode) {
  if (mode === 'time') return positive(config.sec) ? `${Math.round(config.sec)}s` : ''
  if (mode === 'cardio') return positive(config.min) ? `${decimal.format(config.min)} min` : ''
  if (mode === 'distance') return ''

  const reps = n => positive(n) ? String(Math.round(n / (config.side ? 2 : 1))) : ''
  if (isPyramid(config)) return config.pyramid[0] === PYRAMID_MAX ? 'AMRAP' : reps(config.pyramid[0])
  const hi = Math.max(config.repsMax || 0, config.reps || 0)
  const lo = config.repsMin || config.reps
  return positive(lo) && lo < hi ? `${reps(lo)}-${reps(hi)}` : reps(hi)
}

function notesFor(config, mode, unit) {
  const notes = [config.note]
  if (config.side) notes.push(mode === 'time' ? 'Repeat each hold on both sides.' : 'Reps are per side.')
  if (mode === 'distance' && positive(config.m)) notes.push(`Cover ${decimal.format(config.m)} m per set.`)
  if (mode === 'cardio' && positive(config.speed)) notes.push(`Target speed ${decimal.format(config.speed)} km/h.`)
  if (mode === 'cardio' && positive(config.incline)) notes.push(`Incline ${decimal.format(config.incline)}%.`)
  if (isPyramid(config)) {
    const targets = config.pyramid.map((reps, i) => {
      const target = reps === PYRAMID_MAX ? 'AMRAP' : `${Math.round(reps / (config.side ? 2 : 1))} reps`
      const weight = load(config.pyramidWeight?.[i], unit)
      return weight ? `${target} at ${weight}` : target
    })
    notes.push(`Set targets in order are ${targets.join(', ')}.`)
  }
  return notes.map(flat).filter(Boolean).join(' · ')
}

/** Current routine targets, without workout history or profile details. */
export function oneGymCSV(S, instructions = {}) {
  const routines = exportOrder(S, (S.routines || []).filter(r => r?.ex?.length))
  const days = uniqueLabels(routines.map(r => flat(r.name) || 'Routine'))
  const customs = new Map((S.customEx || []).filter(Boolean).map(ex => [ex.id, ex]))
  const lines = [HEADER]
  routines.forEach((routine, dayIndex) => {
    const exercises = routine.ex.map(cfg => customs.get(cfg.id) || EXIDX[cfg.id])
    const names = uniqueLabels(exercises.map((ex, i) => {
      const label = shownNameOf(ex, S.exShownName || {}, S.exAliases || {})
      return flat(label || (ex?.custom ? ex.n : capWords(ex?.n)) || routine.ex[i].id) || 'Exercise'
    }))
    routine.ex.forEach((slot, i) => {
      const ex = exercises[i], unit = exUnitOf(S, slot.id)
      const config = viewTarget(S, slot.id, slot), mode = modeOf(config)
      const pyramid = isPyramid(config)
      const sets = pyramid ? config.pyramid.length : positive(config.sets) ? Math.max(1, Math.round(config.sets)) : 1
      const bodyweight = config.bodyweight ?? isBodyweightEq(ex)
      const pyramidLoad = pyramid ? load(config.pyramidWeight?.find(positive), unit) : ''
      const weight = pyramidLoad || load(config.weight, unit) || (bodyweight ? 'BW' : '')
      const cues = ex?.st?.length ? ex.st : instructions[slot.id] || ex?.cues || []
      const guidance = Array.isArray(cues) ? cues.map(flat).filter(Boolean).join(' · ') : flat(cues)
      const group = GROUPS.get(ex?.bp) || capWords(ex?.bp)
      const target = capWords(ex?.tg) || capWords(ex?.primaries?.[0]?.replaceAll('-', ' '))
      const cells = [days[dayIndex], names[i], sets, repsTime(config, mode), weight, notesFor(config, mode, unit), guidance, group, target]
      lines.push(cells.map(value => csvField(flat(value))).join(','))
    })
  })
  return lines.join('\r\n') + '\r\n'
}
