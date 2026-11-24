import { describe, expect, it } from 'vitest'
import { DEFAULT_OLLAMA_MODEL, defaultTrainingProfile, parseTrainingProfile, prepareCoachRequest } from './personal-training.js'

const profile = {
  goal: 'Build consistency', experience: 'returning', weeklySessions: 2, optionalSession: true,
  sessionMinutes: 45, equipment: ['barbell', 'dumbbell'], preferences: 'Keep the sessions flexible.',
  constraints: 'Use a specific range of motion.', recovery: 'Keep this private by default.',
}

const state = {
  unit: 'kg',
  routines: [{ ex: [{ id: '0025' }] }],
  workouts: [{ d: '2026-11-24', entries: [{ id: '0025', sets: [
    { done: true, w: 35, r: 8 }, { done: false, w: 40, r: 8 }, { done: true, warmup: true, w: 20, r: 5 },
  ] }] }],
  active: { entries: [{ id: '0025', sets: [{ done: true, w: 90, r: 5 }] }] },
}

describe('personal training context', () => {
  it('starts with a usable knee-conscious full-gym profile and cloud model', () => {
    const defaults = defaultTrainingProfile()
    const request = prepareCoachRequest({}, defaults, DEFAULT_OLLAMA_MODEL)
    expect(request.model).toBe('kimi-k3.1-pro')
    expect(request.profile).toMatchObject({ weeklySessions: 2, optionalSession: true, sessionMinutes: 45 })
    expect(request.profile.preferences).toMatch(/low-impact/)
    expect(request.profile.equipment).toEqual(expect.arrayContaining(['dumbbell', 'cable', 'sled machine']))
    expect(request.exercises).toContainEqual(expect.objectContaining({ id: '0739' }))
    expect(request.exercises.some(e => /jump/i.test(e.name))).toBe(false)
    expect(request).not.toHaveProperty('brief')
    expect(request.profile).not.toHaveProperty('constraints')
  })

  it('adds the full gym to an older profile while preserving its saved training preferences', () => {
    const defaults = defaultTrainingProfile(profile)
    expect(defaults).toMatchObject({ goal: profile.goal, preferences: profile.preferences, constraints: profile.constraints })
    expect(defaults.equipment).toContain('sled machine')
    expect(defaultTrainingProfile({ ...profile, equipmentMode: 'custom' }).equipment).toEqual(profile.equipment)
  })

  it('trims the optional focus and omits empty input from the outgoing request', () => {
    expect(prepareCoachRequest(state, profile, 'test-model', { brief: '  More pulling  ' }).brief).toBe('More pulling')
    expect(prepareCoachRequest(state, profile, 'test-model', { brief: 'x'.repeat(400) }).brief).toHaveLength(300)
    expect(prepareCoachRequest(state, profile, 'test-model', { brief: '  ' })).not.toHaveProperty('brief')
  })

  it('accepts a versioned training-only profile and ignores other properties', () => {
    const imported = parseTrainingProfile(JSON.stringify({ openGymTrainingProfile: 1, profile: { ...profile, apiKey: 'never read', preferredDays: [2] } }))
    expect(imported).toEqual(profile)
    expect(() => parseTrainingProfile(JSON.stringify({ profile }))).toThrow()
    expect(() => parseTrainingProfile(JSON.stringify({ openGymTrainingProfile: 1, profile: { ...profile, sessionMinutes: 0 } }))).toThrow()
  })

  it('omits motion and recovery notes and logged sets by default', () => {
    const request = prepareCoachRequest(state, profile, 'test-model')
    expect(request.profile).not.toHaveProperty('constraints')
    expect(request.profile).not.toHaveProperty('recovery')
    expect(request.profile).not.toHaveProperty('recentPerformance')
    expect(request.exercises[0]).toMatchObject({ id: '0025', equipment: 'barbell' })
    expect(request.exercises.length).toBeLessThanOrEqual(80)
  })

  it('shares only reviewed context and checked saved work sets when selected', () => {
    const request = prepareCoachRequest(state, profile, 'test-model', { constraints: true, recentPerformance: true }, '2026-11-24')
    expect(request.profile.recentPerformance).toEqual([{ id: '0025', weight: 35, reps: 8, unit: 'kg' }])
    expect(request.profile.constraints).toBe(profile.constraints)
    expect(request.profile).not.toHaveProperty('recovery')
  })
})
