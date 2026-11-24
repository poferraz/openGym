import { useEffect, useRef, useState } from 'react'
import { Button, MultiSelectRow, SelectRow, Section, TextArea, TextField } from '../components/ui.jsx'
import OllamaConnection, { useOllamaKeyVault } from '../components/OllamaConnection.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { capWords } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { canStartDraftRotation, parseRoutineDraft, saveRoutineDraft } from '../lib/personal-routine-draft.js'
import { DEFAULT_OLLAMA_MODEL, FAST_OLLAMA_MODEL, defaultTrainingProfile, normalizeTrainingProfile, parseTrainingProfile, PERSONAL_EQUIPMENT, prepareCoachRequest, TRAINING_PROFILE_LIMIT } from '../lib/personal-training.js'

const options = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => ({ value: start + i, label: String(start + i) }))
const stack = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }
const fields = { ...stack, padding: 12 }
const labelStyle = { ...stack, gap: 5 }
const inputStyle = { background: 'var(--surface-2)', minWidth: 0 }
const summaryStyle = { paddingBlock: 12, minHeight: 44, cursor: 'pointer' }
const payloadStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '15rem', overflow: 'auto' }

function ToggleField({ label, checked, onChange }) {
  return <label className="row" style={{ minHeight: 44 }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
}

const issueText = code => {
  if (code === 'invalid_key') return t('Ollama rejected the API key. Check it under Ollama Cloud.')
  if (code === 'quota') return t('Ollama is rate-limiting requests or your quota has been reached.')
  if (code === 'timeout') return t('Ollama took too long. Try again or choose a different model.')
  if (code === 'invalid_request' || code === 'model_unavailable') return t('Check the model name and training profile, then try again.')
  return t('Could not generate a draft. Check the connection and try again.')
}

export default function PersonalTraining() {
  const saved = useStore(s => s.S.personalTraining)
  const canRotate = useStore(s => canStartDraftRotation(s.S))
  const toast = useUI(s => s.toast)
  const vault = useOllamaKeyVault()
  const [profile, setProfile] = useState(() => defaultTrainingProfile(saved))
  const [model, setModel] = useState(() => {
    const savedModel = useStore.getState().S.personalOllamaModel
    return typeof savedModel === 'string' && savedModel.trim() ? savedModel : DEFAULT_OLLAMA_MODEL
  })
  const [brief, setBrief] = useState('')
  const [share, setShare] = useState({ constraints: false, recovery: false, recentPerformance: false })
  const [review, setReview] = useState(null)
  const [draft, setDraft] = useState(null)
  const [startRotation, setStartRotation] = useState(false)
  const [error, setError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef(null)
  const request = useRef(null)
  const reviewPanel = useRef(null)
  const draftPanel = useRef(null)
  const clean = normalizeTrainingProfile(profile)
  const selectedModel = model.trim() || DEFAULT_OLLAMA_MODEL

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { if (review) reviewPanel.current?.focus() }, [review])
  useEffect(() => { if (draft) draftPanel.current?.focus() }, [draft])

  const change = (field, value) => {
    setProfile(current => ({ ...current, [field]: value }))
    setReview(null)
  }
  const updateModel = value => {
    setModel(value)
    setReview(null)
    useStore.getState().update(s => { s.personalOllamaModel = value.slice(0, 100) })
  }
  const setSharing = (field, value) => {
    setShare(current => ({ ...current, [field]: value }))
    setReview(null)
  }
  const toggleEquipment = value => {
    setProfile(current => ({ ...current, equipmentMode: 'custom', equipment: current.equipment.includes(value)
      ? current.equipment.filter(item => item !== value) : [...current.equipment, value] }))
    setReview(null)
  }
  const saveProfile = () => {
    if (!clean) return
    useStore.getState().update(s => { s.personalTraining = clean })
    toast(t('Training profile saved'))
  }
  const importProfile = async event => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    try {
      if (selected.size > TRAINING_PROFILE_LIMIT) throw new Error()
      setProfile({ ...parseTrainingProfile(await selected.text()), equipmentMode: 'custom' })
      setShare({ constraints: false, recovery: false, recentPerformance: false })
      setReview(null)
      setError('')
      setProfileError('')
      toast(t('Profile loaded. Review it before saving.'))
    } catch {
      setProfileError(t('This file is not a valid OpenGym training profile.'))
    }
  }
  const reviewRequest = () => {
    setError('')
    if (!clean || !vault.key) return
    const prepared = prepareCoachRequest(useStore.getState().S, clean, selectedModel, { ...share, brief })
    if (prepared.exercises.length < 4) {
      setError(t('Select equipment with at least four eligible exercises.'))
      return
    }
    setReview(prepared)
  }
  const generate = async () => {
    if (!review || !vault.key || request.current) return
    const pending = new AbortController()
    request.current = pending
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/coach-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vault.key}` },
        body: JSON.stringify(review),
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: pending.signal,
      })
      const body = await response.json().catch(() => null)
      if (pending.signal.aborted) return
      if (!response.ok) {
        setError(response.status === 404 ? t('This deployment has no Ollama relay.') : issueText(body?.code))
        return
      }
      try {
        setDraft(parseRoutineDraft(body?.text, review.exercises, review.profile))
        setStartRotation(false)
        setReview(null)
      } catch {
        setError(t('Ollama returned a draft that did not pass the routine checks. Try again or choose a different model.'))
      }
    } catch {
      if (!pending.signal.aborted) setError(issueText())
    } finally {
      if (request.current === pending) {
        request.current = null
        if (!pending.signal.aborted) setBusy(false)
      }
    }
  }
  const editOrCancelReview = () => {
    const pending = request.current
    if (pending) {
      request.current = null
      pending.abort()
      setBusy(false)
    } else {
      setReview(null)
    }
    setError('')
  }
  const saveDraft = () => {
    if (!draft) return
    useStore.getState().update(s => { saveRoutineDraft(s, draft, { useRotation: startRotation }) })
    setDraft(null)
    toast(t('Draft saved in Plan'))
  }

  return <>
    {!vault.key && <OllamaConnection vault={vault} showModel={false} />}

    {vault.key && !review && !draft && <Section title={t('Draft a rotation')}>
      <div style={fields}>
        {clean && <p className="small muted">
          {tn('{0} strength workout per week', '{0} strength workouts per week', clean.weeklySessions)}
          {clean.optionalSession && ` + ${t('1 optional')}`} · {t('{0} min per visit', clean.sessionMinutes)}
        </p>}
        <label style={labelStyle}>
          <span>{t('What are you looking for?')} <span className="small muted">{t('Optional')}</span></span>
          <TextArea rows={2} maxLength={300} style={{ ...inputStyle, minHeight: 72 }} value={brief} onChange={e => setBrief(e.target.value)} />
        </label>
        <Button type="button" variant="primary" icon="sparkles" disabled={!clean} onClick={reviewRequest}>{t('Draft routine')}</Button>
        {!clean && <p className="small muted">{t('Complete your training preferences under Advanced.')}</p>}
        {error && <p className="small" role="alert">{error}</p>}
      </div>
    </Section>}

    {review && <Section title={t('Review Ollama request')}>
      <div style={fields} ref={reviewPanel} tabIndex={-1}>
        <p className="small">{t('Generation sends your reviewed training details to Ollama Cloud through Vercel. Your API key accompanies the request.')}</p>
        {review.brief && <p style={{ overflowWrap: 'anywhere' }}>{review.brief}</p>}
        <p className="small muted" style={{ overflowWrap: 'anywhere' }}>{review.model} · {t('{0} exercise options from the catalog', review.exercises.length)}</p>
        <details>
          <summary style={summaryStyle}>{t('Review what will be sent')}</summary>
          <pre className="small" style={payloadStyle}>{JSON.stringify(review, null, 2)}</pre>
        </details>
        <Button type="button" variant="primary" disabled={busy || !vault.key} onClick={generate}>{busy ? t('Generating…') : t('Send and generate draft')}</Button>
        <Button type="button" variant="ghost" onClick={editOrCancelReview}>{busy ? t('Cancel') : t('Edit')}</Button>
        {!vault.key && <p className="small">{t('Enter or unlock your Ollama API key first.')}</p>}
        {error && <p className="small" role="alert">{error}</p>}
      </div>
    </Section>}

    {draft && <Section title={t('Review the draft rotation')}>
      <div style={fields} ref={draftPanel} tabIndex={-1}>
        <p className="small">{t('Starting loads are left open. Saving adds separate routines that you can edit in Plan.')}</p>
        {draft.routines.map(routine => <section key={routine.name} className="card" style={{ ...stack, overflowWrap: 'anywhere' }}>
          <h3>{routine.name} · {t('about {0} min', Math.ceil(routine.minutes))}</h3>
          <ul style={{ ...stack, listStyle: 'none' }}>{routine.ex.map(e => <li key={e.id}>
            <strong>{capWords(EXIDX[e.id]?.n)} · {t(capWords(EXIDX[e.id]?.eq))}</strong>
            <div className="small">{e.sets} × {e.repsMin === e.reps ? e.reps : `${e.repsMin}–${e.reps}`} · {t('{0}s rest', e.restSec)}</div>
            {e.note && <div className="small">{e.note}</div>}
          </li>)}</ul>
        </section>)}
        {canRotate && <ToggleField checked={startRotation} label={t('Start this rotation after saving')} onChange={setStartRotation} />}
        <Button type="button" variant="primary" onClick={saveDraft}>{t('Save draft routines')}</Button>
        <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{t('Discard draft')}</Button>
      </div>
    </Section>}

    <details className="card">
      <summary style={summaryStyle}><strong>{t('Advanced')}</strong></summary>
      <fieldset disabled={busy} style={{ border: 0, minInlineSize: 0 }}>
        {vault.key && <OllamaConnection vault={vault} showModel={false} />}
        <Section title={t('Training preferences')} footer={t('Saved with your local training data and included in JSON backups.')}>
          <div style={fields}>
            <label style={labelStyle}>{t('Model')}
              <TextField name="model" value={model} placeholder={DEFAULT_OLLAMA_MODEL} maxLength={100} style={inputStyle}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={e => updateModel(e.target.value)} />
            </label>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Button type="button" size="sm" variant={selectedModel === DEFAULT_OLLAMA_MODEL ? 'tinted' : 'ghost'}
                aria-pressed={selectedModel === DEFAULT_OLLAMA_MODEL} onClick={() => updateModel(DEFAULT_OLLAMA_MODEL)}>{t('Default model')}</Button>
              <Button type="button" size="sm" variant={selectedModel === FAST_OLLAMA_MODEL ? 'tinted' : 'ghost'}
                aria-pressed={selectedModel === FAST_OLLAMA_MODEL} onClick={() => updateModel(FAST_OLLAMA_MODEL)}>{t('Faster model')}</Button>
            </div>
            <label style={labelStyle}>{t('Training goal')}
              <TextField value={profile.goal} maxLength={120} style={inputStyle} onChange={e => change('goal', e.target.value)} />
            </label>
            <SelectRow icon="figureStrength" title={t('Lifting experience')} value={profile.experience} onChange={v => change('experience', v)} options={[
              { value: 'new', label: t('New to lifting') }, { value: 'returning', label: t('Coming back after a break') },
              { value: 'regular', label: t('Training regularly') },
            ]} />
            <SelectRow icon="target" title={t('Strength workouts per week')} value={profile.weeklySessions} onChange={v => change('weeklySessions', v)} options={options(1, 7)} />
            {profile.weeklySessions < 7 && <ToggleField checked={profile.optionalSession} label={t('Allow an extra session')} onChange={v => change('optionalSession', v)} />}
            <label style={labelStyle}>{t('Total minutes per visit')}
              <TextField type="number" inputMode="numeric" min="15" max="180" value={profile.sessionMinutes} style={inputStyle} onChange={e => change('sessionMinutes', e.target.valueAsNumber || '')} />
            </label>
            <MultiSelectRow icon="kettlebell" title={t('Available equipment')} values={profile.equipment}
              options={PERSONAL_EQUIPMENT.map(value => ({ value, label: capWords(value) }))} onToggle={toggleEquipment} />
            <label style={labelStyle}>{t('Exercises and programming preferences')}
              <TextArea rows={3} value={profile.preferences} maxLength={600} style={inputStyle} onChange={e => change('preferences', e.target.value)} />
            </label>
            <label style={labelStyle}>{t('Current movement constraints')}
              <TextArea rows={2} value={profile.constraints} maxLength={500} style={inputStyle} onChange={e => change('constraints', e.target.value)} />
            </label>
            {profile.constraints.trim() && <ToggleField checked={share.constraints} label={t('Share movement constraints')} onChange={v => setSharing('constraints', v)} />}
            <label style={labelStyle}>{t('Recovery context for this draft')}
              <TextArea rows={2} value={profile.recovery} maxLength={500} style={inputStyle} onChange={e => change('recovery', e.target.value)} />
            </label>
            {profile.recovery.trim() && <ToggleField checked={share.recovery} label={t('Share recovery notes')} onChange={v => setSharing('recovery', v)} />}
            <ToggleField checked={share.recentPerformance} label={t('Share recent completed sets')} onChange={v => setSharing('recentPerformance', v)} />
            <Button type="button" variant="tinted" disabled={!clean} onClick={saveProfile}>{t('Save training profile')}</Button>
            <Button type="button" icon="download" onClick={() => file.current.click()}>{t('Import training profile')}</Button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={importProfile} />
            {profileError && <p className="small" role="alert">{profileError}</p>}
          </div>
        </Section>
      </fieldset>
    </details>
  </>
}
