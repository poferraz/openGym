import { useState, useSyncExternalStore } from 'react'
import {
  canRememberOllamaKey, forgetOllamaKey, getOllamaKeySnapshot, lockOllamaKey,
  MIN_OLLAMA_PASSPHRASE_LENGTH, rememberOllamaKey, subscribeOllamaKey, unlockOllamaKey,
  useOllamaKeyForSession
} from '../lib/ollama-key-vault.js'
import { Button, Section, TextField } from './ui.jsx'

export function useOllamaKeyVault() {
  const state = useSyncExternalStore(subscribeOllamaKey, getOllamaKeySnapshot)
  return { ...state, useForSession: useOllamaKeyForSession, remember: rememberOllamaKey,
    unlock: unlockOllamaKey, lock: lockOllamaKey, forget: forgetOllamaKey }
}

const fieldsStyle = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }
const labelStyle = { ...fieldsStyle, gap: 5 }
const actionsStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }
const inputStyle = { background: 'var(--surface-2)', minWidth: 0 }

export default function OllamaConnection({ vault, model, onModelChange, showModel = true }) {
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const perform = async action => {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveKey = event => {
    event.preventDefault()
    const form = event.currentTarget
    const key = form.elements.apiKey.value
    const passphrase = form.elements.passphrase?.value
    const confirmation = form.elements.confirmPassphrase?.value
    if (remember && passphrase !== confirmation) {
      setError('The passphrases must match.')
      return
    }
    form.reset()
    return perform(async () => {
      if (remember) await vault.remember(key, passphrase)
      else vault.useForSession(key)
      setRemember(false)
    })
  }

  const unlockKey = event => {
    event.preventDefault()
    const form = event.currentTarget
    const passphrase = form.elements.passphrase.value
    form.reset()
    return perform(() => vault.unlock(passphrase))
  }

  const forget = () => perform(() => vault.forget())
  const lock = () => perform(() => vault.lock())

  return <Section title="Ollama Cloud" footer={vault.key ? undefined : 'When you send a draft request, the Vercel relay forwards your key to Ollama.'}>
    <div style={{ ...fieldsStyle, padding: 12 }}>
      {showModel && <label style={labelStyle}>
        <span>Model</span>
        <TextField name="model" value={model ?? ''} style={inputStyle} onChange={event => onModelChange(event.target.value)}
          spellCheck={false} autoCapitalize="none" autoCorrect="off" />
      </label>}

      {vault.key ? <>
        <span className="small" role="status">{vault.remembered ? 'Saved key unlocked for this session.' : 'API key ready for this session.'}</span>
        <div style={actionsStyle}>
          <Button type="button" size="sm" variant="tinted" disabled={busy} onClick={lock}>{vault.remembered ? 'Lock key' : 'Clear key'}</Button>
          {vault.remembered && <Button type="button" size="sm" disabled={busy} onClick={forget}>Forget saved key</Button>}
        </div>
      </> : vault.remembered ? <form onSubmit={unlockKey} autoComplete="off" style={fieldsStyle} aria-busy={busy}>
        <label style={labelStyle}>
          <span>Passphrase for saved key</span>
          <TextField name="passphrase" type="password" autoComplete="off" style={inputStyle} required />
        </label>
        <div style={actionsStyle}>
          <Button type="submit" variant="primary" disabled={busy}>Unlock key</Button>
          <Button type="button" size="sm" disabled={busy} onClick={forget}>Forget saved key</Button>
        </div>
      </form> : <form onSubmit={saveKey} autoComplete="off" style={fieldsStyle} aria-busy={busy}>
        <label style={labelStyle}>
          <span>Ollama API key</span>
          <TextField name="apiKey" type="password" autoComplete="off" spellCheck={false} style={inputStyle} required />
        </label>
        <label className="row small" style={{ gap: 8, minHeight: 44 }}>
          <input type="checkbox" checked={remember} disabled={!canRememberOllamaKey() || busy} onChange={event => setRemember(event.target.checked)} />
          Remember on this device
        </label>
        {remember ? <>
          <label style={labelStyle}>
            <span>Passphrase</span>
            <TextField name="passphrase" type="password" autoComplete="off" style={inputStyle} required minLength={MIN_OLLAMA_PASSPHRASE_LENGTH} />
          </label>
          <label style={labelStyle}>
            <span>Confirm passphrase</span>
            <TextField name="confirmPassphrase" type="password" autoComplete="off" style={inputStyle} required minLength={MIN_OLLAMA_PASSPHRASE_LENGTH} />
          </label>
          <span className="muted small">Use at least {MIN_OLLAMA_PASSPHRASE_LENGTH} characters. This passphrase unlocks the encrypted key each time you reopen the app.</span>
        </> : <span className="muted small">By default, the key clears when you reload or close this tab.</span>}
        <Button type="submit" variant="primary" disabled={busy}>{remember ? 'Save encrypted key' : 'Use key for this session'}</Button>
        <a className="small" href="https://ollama.com/settings/keys" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>Get an Ollama API key</a>
      </form>}

      {error && <span role="alert" className="small" style={{ color: 'var(--red)' }}>{error}</span>}
    </div>
  </Section>
}
