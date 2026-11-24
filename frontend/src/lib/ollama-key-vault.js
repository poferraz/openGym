// A browser session keeps its key here in memory. The only persistent value is the optional
// encrypted record, separate from training state and its backups.
const STORAGE_KEY = 'opengym_personal_ollama_key_v1'
const VERSION = 1
const ITERATIONS = 600_000
const MAX_KEY_BYTES = 4096
export const MIN_OLLAMA_PASSPHRASE_LENGTH = 12

const text = new TextEncoder()
const context = text.encode('openGym Personal Ollama key vault v1')
const toBase64 = bytes => btoa(String.fromCharCode(...bytes))
const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0))

const readRecord = () => localStorage.getItem(STORAGE_KEY)
function hasRecord() {
  try { return !!readRecord() } catch { return false }
}

let snapshot
let revision = 0
const listeners = new Set()
export function getOllamaKeySnapshot() {
  return snapshot ??= { key: '', remembered: hasRecord() }
}
function publish(key, remembered) {
  revision++
  snapshot = { key, remembered }
  listeners.forEach(listener => listener())
}
export function subscribeOllamaKey(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Lock this tab if another tab changes the saved record. Session keys are never shared.
globalThis.addEventListener?.('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return
  const remembered = hasRecord()
  if (remembered || getOllamaKeySnapshot().remembered) publish('', remembered)
})

function cleanKey(raw) {
  const key = String(raw ?? '').trim()
  if (!key || key.length > MAX_KEY_BYTES || /[^!-~]/.test(key)) throw new Error('Enter a valid Ollama API key.')
  return key
}

export function useOllamaKeyForSession(raw) {
  publish(cleanKey(raw), hasRecord())
}

export function lockOllamaKey() {
  publish('', hasRecord())
}

export function forgetOllamaKey() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    throw new Error('Could not remove the saved key from this browser.')
  } finally {
    lockOllamaKey()
  }
}

async function deriveKey(crypto, passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', text.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export function canRememberOllamaKey() {
  return !!globalThis.crypto?.subtle
}

export async function rememberOllamaKey(raw, passphrase) {
  const key = cleanKey(raw)
  if (typeof passphrase !== 'string' || passphrase.trim().length < MIN_OLLAMA_PASSPHRASE_LENGTH) {
    throw new Error(`Use a passphrase with at least ${MIN_OLLAMA_PASSPHRASE_LENGTH} characters.`)
  }
  if (!canRememberOllamaKey()) throw new Error('Saving an encrypted key requires a secure browser connection.')

  const before = revision
  const crypto = globalThis.crypto
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptionKey = await deriveKey(crypto, passphrase, salt)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context }, encryptionKey, text.encode(key))
  if (revision !== before) throw new Error('The key changed while saving. Try again.')

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: VERSION, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(data))
    }))
  } catch {
    throw new Error('Could not save the encrypted key in this browser.')
  }
  publish(key, true)
}

export async function unlockOllamaKey(passphrase) {
  const before = revision
  try {
    const saved = readRecord()
    const record = JSON.parse(saved)
    if (record?.version !== VERSION || typeof passphrase !== 'string' || !passphrase ||
        typeof record.salt !== 'string' || record.salt.length !== 24 ||
        typeof record.iv !== 'string' || record.iv.length !== 16 ||
        typeof record.data !== 'string' || record.data.length > Math.ceil((MAX_KEY_BYTES + 16) / 3) * 4) throw new Error()

    const salt = fromBase64(record.salt)
    const iv = fromBase64(record.iv)
    const data = fromBase64(record.data)
    if (salt.length !== 16 || iv.length !== 12 || data.length <= 16) throw new Error()

    const crypto = globalThis.crypto
    const encryptionKey = await deriveKey(crypto, passphrase, salt)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: context }, encryptionKey, data)
    if (revision !== before || readRecord() !== saved) throw new Error()
    publish(cleanKey(new TextDecoder().decode(plaintext)), true)
  } catch {
    throw new Error('Could not unlock the saved key. Check your passphrase and try again.')
  }
}
