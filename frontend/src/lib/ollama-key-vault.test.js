// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetOllamaKey, getOllamaKeySnapshot, lockOllamaKey, rememberOllamaKey,
  unlockOllamaKey, useOllamaKeyForSession
} from './ollama-key-vault.js'

const key = 'test-credential-used-only-in-the-ollama-vault-tests'
const passphrase = 'example-only passphrase for the vault'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  forgetOllamaKey()
})

describe('Ollama key vault', () => {
  it('uses the default credential in memory only', () => {
    useOllamaKeyForSession(` ${key} `)

    expect(getOllamaKeySnapshot()).toEqual({ key, remembered: false })
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)

    lockOllamaKey()
    expect(getOllamaKeySnapshot()).toEqual({ key: '', remembered: false })
  })

  it('encrypts the opt-in key and requires the passphrase to unlock it again', async () => {
    await rememberOllamaKey(key, passphrase)
    expect(getOllamaKeySnapshot()).toEqual({ key, remembered: true })
    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(0)
    const saved = localStorage.getItem(localStorage.key(0))
    expect(saved).not.toContain(key)
    expect(saved).not.toContain(passphrase)

    lockOllamaKey()
    expect(getOllamaKeySnapshot()).toEqual({ key: '', remembered: true })
    await expect(unlockOllamaKey('different example passphrase')).rejects.toThrow(/could not unlock/i)
    expect(getOllamaKeySnapshot().key).toBe('')

    await unlockOllamaKey(passphrase)
    expect(getOllamaKeySnapshot()).toEqual({ key, remembered: true })
  })

  it('authenticates ciphertext and uses fresh inputs when saving the same key again', async () => {
    await rememberOllamaKey(key, passphrase)
    const name = localStorage.key(0)
    const first = JSON.parse(localStorage.getItem(name))
    await rememberOllamaKey(key, passphrase)
    const next = JSON.parse(localStorage.getItem(name))
    expect(next.salt).not.toBe(first.salt)
    expect(next.iv).not.toBe(first.iv)
    expect(next.data).not.toBe(first.data)

    next.data = (next.data[0] === 'A' ? 'B' : 'A') + next.data.slice(1)
    localStorage.setItem(name, JSON.stringify(next))
    lockOllamaKey()
    await expect(unlockOllamaKey(passphrase)).rejects.toThrow(/could not unlock/i)
    expect(getOllamaKeySnapshot().key).toBe('')
  })

  it('deletes the encrypted record and clears the unlocked copy', async () => {
    await rememberOllamaKey(key, passphrase)
    forgetOllamaKey()

    expect(localStorage.length).toBe(0)
    expect(getOllamaKeySnapshot()).toEqual({ key: '', remembered: false })
    await expect(unlockOllamaKey(passphrase)).rejects.toThrow(/could not unlock/i)
  })

  it('does not restore a key if the user forgets it while unlocking', async () => {
    await rememberOllamaKey(key, passphrase)
    lockOllamaKey()
    const unlocking = unlockOllamaKey(passphrase)
    forgetOllamaKey()

    await expect(unlocking).rejects.toThrow(/could not unlock/i)
    expect(getOllamaKeySnapshot()).toEqual({ key: '', remembered: false })
  })
})
