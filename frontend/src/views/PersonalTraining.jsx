import { useEffect, useRef, useState } from 'react'
import { Button, Check, MultiSelectRow, SelectRow, Section, TextArea, TextField } from '../components/ui.jsx'
import OllamaConnection, { useOllamaKeyVault } from '../components/OllamaConnection.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { capWords } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { canStartDraftRotation, parseRoutineDraft, saveRoutineDraft } from '../lib/personal-routine-draft.js'
import { emptyTrainingProfile, normalizeTrainingProfile, parseTrainingProfile, PERSONAL_EQUIPMENT, prepareCoachRequest, TRAINING_PROFILE_LIMIT } from '../lib/personal-training.js'

const options = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => ({ value: start + i, label: String(start + i) }))
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
  const [profile, setProfile] = useState(() => normalizeTrainingProfile(saved) || emptyTrainingProfile())
  const [model, setModel] = useState(() => {
    const savedModel = useStore.getState().S.personalOllamaModel
    return typeof savedModel === 'string' ? savedModel : 'gpt-oss:120b'
  })
  const [share, setShare] = useState({ constraints: false, recovery: false, recentPerformance: false })
  const [review, setReview] = useState(null)
  const [draft, setDraft] = useState(null)
  const [startRotation, setStartRotation] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef(null)
  const request = useRef(null)
  const reviewPanel = useRef(null)
  const draftPanel = useRef(null)
  const clean = normalizeTrainingProfile(profile)

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { if (review) reviewPanel.current?.focus() }, [review])
  useEffect(() => { if (draft) draftPanel.current?.focus() }, [draft])

  const change = (field, value) => {
    setProfile(current => ({ ...current, [field]: value }))
    setReview(null)
  }
  const setSharing = (field, value) => {
    setShare(current => ({ ...current, [field]: value }))
    setReview(null)
  }
  const toggleEquipment = value => {
    setProfile(current => ({ ...current, equipment: current.equipment.includes(value)
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
      setProfile(parseTrainingProfile(await selected.text()))
      setShare({ constraints: false, recovery: false, recentPerformance: false })
      setReview(null)
      setError('')
      toast(t('Profile loaded. Review it before saving.'))
    } catch {
      setError(t('This file is not a valid OpenGym training profile.'))
    }
  }
  const reviewRequest = () => {
    setError('')
    if (!clean || !model.trim()) return
    const prepared = prepareCoachRequest(useStore.getState().S, clean, model, share)
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
      request.current = null
      if (!pending.signal.aborted) setBusy(false)
    }
  }
  const saveDraft = () => {
    if (!draft) return
    useStore.getState().update(s => { saveRoutineDraft(s, draft, { useRotation: startRotation }) })
    setDraft(null)
    toast(t('Draft saved in Plan'))
  }

  return <>
    <Section title={t('Training preferences')} footer={t('Saved with your local training data and included in JSON backups.') }>
      <div className="pad" style={{ display: 'grid', gap: 12, padding: 12 }}>
        <Button icon="download" onClick={() => file.current.click()}>{t('Import training profile')}</Button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={importProfile} />
        <label>{t('Training goal')}<TextField value={profile.goal} maxLength={120} onChange={e => change('goal', e.target.value)} /></label>
        <SelectRow icon="figureStrength" title={t('Lifting experience')} value={profile.experience} onChange={v => change('experience', v)} options={[
          { value: '', label: t('Choose') }, { value: 'new', label: t('New to lifting') },
          { value: 'returning', label: t('Coming back after a break') }, { value: 'regular', label: t('Training regularly') },
        ]} />
        <SelectRow icon="target" title={t('Strength sessions per week')} value={profile.weeklySessions} onChange={v => change('weeklySessions', v)} options={options(1, 7)} />
        {profile.weeklySessions < 7 && <div className="row"><Check checked={profile.optionalSession} label={t('Allow an extra session')} onChange={v => change('optionalSession', v)} />{t('Allow an extra session')}</div>}
        <label>{t('Total minutes per visit')}<TextField type="number" min="15" max="180" value={profile.sessionMinutes} onChange={e => change('sessionMinutes', e.target.valueAsNumber || '')} /></label>
        <MultiSelectRow icon="kettlebell" title={t('Available equipment')} values={profile.equipment}
          options={PERSONAL_EQUIPMENT.map(value => ({ value, label: capWords(value) }))} onToggle={toggleEquipment} />
        <label>{t('Exercises and programming preferences')}<TextArea rows={3} value={profile.preferences} maxLength={600} onChange={e => change('preferences', e.target.value)} /></label>
        <label>{t('Current movement constraints')}<TextArea rows={2} value={profile.constraints} maxLength={500} onChange={e => change('constraints', e.target.value)} /></label>
        <label>{t('Recovery context for this draft')}<TextArea rows={2} value={profile.recovery} maxLength={500} onChange={e => change('recovery', e.target.value)} /></label>
        <Button variant="primary" disabled={!clean} onClick={saveProfile}>{t('Save training profile')}</Button>
      </div>
    </Section>

    <OllamaConnection vault={vault} model={model} onModelChange={value => {
      setModel(value)
      setReview(null)
      useStore.getState().update(s => { s.personalOllamaModel = value.slice(0, 100) })
    }} />

    <Section title={t('Draft a rotation')} footer={t('Generation sends your reviewed training details to Ollama Cloud through Vercel. Your API key accompanies the request.') }>
      <div style={{ display: 'grid', gap: 10, padding: 12 }}>
        {profile.constraints.trim() && <div className="row"><Check checked={share.constraints} label={t('Share movement constraints')} onChange={v => setSharing('constraints', v)} />{t('Share movement constraints')}</div>}
        {profile.recovery.trim() && <div className="row"><Check checked={share.recovery} label={t('Share recovery notes')} onChange={v => setSharing('recovery', v)} />{t('Share recovery notes')}</div>}
        <div className="row"><Check checked={share.recentPerformance} label={t('Share recent completed sets')} onChange={v => setSharing('recentPerformance', v)} />{t('Share recent completed sets')}</div>
        <Button icon="eye" disabled={!clean || !model.trim() || busy} onClick={reviewRequest}>{t('Review what will be sent')}</Button>
        {review && <div className="card" ref={reviewPanel} tabIndex={-1}>
          <h3>{t('Review Ollama request')}</h3>
          <p className="small">{t('{0} exercise options from the catalog', review.exercises.length)}</p>
          <details open><summary>{t('Training details')}</summary>
            <pre className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(review.profile, null, 2)}</pre>
          </details>
          <details><summary>{t('Exercise options and model')}</summary>
            <pre className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ model: review.model, exercises: review.exercises }, null, 2)}</pre>
          </details>
          <Button variant="primary" disabled={busy || !vault.key} onClick={generate}>{busy ? t('Generating…') : t('Send and generate draft')}</Button>
          {!vault.key && <p className="small">{t('Enter or unlock your Ollama API key first.')}</p>}
        </div>}
        {error && <p role="alert">{error}</p>}
        {draft && <div className="card" ref={draftPanel} tabIndex={-1}>
          <h3>{t('Review the draft rotation')}</h3>
          <p className="small">{t('Starting loads are left open. Saving adds separate routines that you can edit in Plan.')}</p>
          {draft.routines.map(routine => <section key={routine.name}>
            <h4>{routine.name} · {t('about {0} min', Math.ceil(routine.minutes))}</h4>
            <ul>{routine.ex.map(e => <li key={e.id}>
              <strong>{capWords(EXIDX[e.id]?.n)} · {t(capWords(EXIDX[e.id]?.eq))}</strong>
              <div className="small">{e.sets} × {e.repsMin === e.reps ? e.reps : `${e.repsMin}–${e.reps}`} · {t('{0}s rest', e.restSec)}</div>
              {e.note && <div className="small">{e.note}</div>}
            </li>)}</ul>
          </section>)}
          {canRotate && <div className="row"><Check checked={startRotation} label={t('Start this rotation after saving')} onChange={setStartRotation} />{t('Start this rotation after saving')}</div>}
          <Button variant="primary" onClick={saveDraft}>{t('Save draft routines')}</Button>
          <Button variant="ghost" onClick={() => setDraft(null)}>{t('Discard draft')}</Button>
        </div>}
      </div>
    </Section>
  </>
}
