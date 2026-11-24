// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import OllamaConnection, { useOllamaKeyVault } from './OllamaConnection.jsx'
import { forgetOllamaKey, getOllamaKeySnapshot, lockOllamaKey, rememberOllamaKey } from '../lib/ollama-key-vault.js'

const key = 'example-ollama-key'
const passphrase = 'vault example passphrase'
let host, root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  forgetOllamaKey()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function Page() {
  const vault = useOllamaKeyVault()
  const [model, setModel] = useState('example-model')
  return <><OllamaConnection vault={vault} model={model} onModelChange={setModel} />
    <output>{vault.key ? 'ready' : 'locked'}</output></>
}

const render = () => act(async () => root.render(<Page />))
const button = name => [...host.querySelectorAll('button')].find(button => button.textContent === name)
const submit = () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

it('keeps a key in memory while moving between pages and lets the user clear it', async () => {
  await render()
  expect(host.querySelector('input[name="model"]').value).toBe('example-model')
  expect(host.querySelector('input[type="checkbox"]').checked).toBe(false)
  host.querySelector('input[name="apiKey"]').value = key
  await act(async () => submit())

  expect(host.querySelector('output').textContent).toBe('ready')
  expect(localStorage.length).toBe(0)
  expect(host.innerHTML).not.toContain(key)
  await act(async () => root.render(null))
  await render()
  expect(host.querySelector('output').textContent).toBe('ready')

  await act(async () => button('Clear key').click())
  expect(host.querySelector('output').textContent).toBe('locked')
})

it('unlocks a saved key through the passphrase field and forgets it through the panel', async () => {
  await rememberOllamaKey(key, passphrase)
  lockOllamaKey()
  await render()

  expect(host.querySelector('input[name="apiKey"]')).toBeNull()
  host.querySelector('input[name="passphrase"]').value = passphrase
  await act(async () => {
    submit()
    await vi.waitFor(() => expect(getOllamaKeySnapshot().key).toBe(key))
  })
  expect(host.querySelector('output').textContent).toBe('ready')
  expect(host.innerHTML).not.toContain(passphrase)

  await act(async () => button('Forget saved key').click())
  expect(host.querySelector('output').textContent).toBe('locked')
  expect(localStorage.length).toBe(0)
})

it('requires matching passphrases before remembering a key', async () => {
  await render()
  await act(async () => host.querySelector('input[type="checkbox"]').click())
  host.querySelector('input[name="apiKey"]').value = key
  host.querySelector('input[name="passphrase"]').value = passphrase
  const confirm = host.querySelector('input[name="confirmPassphrase"]')
  confirm.value = 'different example passphrase'
  await act(async () => submit())
  expect(host.querySelector('[role="alert"]').textContent).toMatch(/match/i)
  expect(localStorage.length).toBe(0)

  confirm.value = passphrase
  await act(async () => {
    submit()
    await vi.waitFor(() => expect(getOllamaKeySnapshot()).toEqual({ key, remembered: true }))
  })
  expect(host.querySelector('output').textContent).toBe('ready')
  expect(localStorage.getItem(localStorage.key(0))).not.toContain(key)
})
