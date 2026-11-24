import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../../services/api/index.js'

const origin = 'https://personal.vercel.app'
const binding = 'https://coach.internal.example'
const path = '/api/coach-plan'
function request({ route = path, method = 'POST', headers = {} } = {}) {
  return new Request(origin + route, {
    method,
    headers: { Origin: origin, Authorization: 'Bearer test-ollama-key', 'Content-Type': 'application/json', ...headers },
    body: method === 'POST' ? '{"model":"example"}' : undefined,
  })
}

beforeEach(() => {
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'personal.vercel.app')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('COACH_INTERNAL_URL', binding)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('public Coach service', () => {
  it('uses the injected binding and forwards only the request fields the Coach needs', async () => {
    const relay = vi.fn(async (_url, init) => {
      expect(await new Response(init.body).text()).toBe('{"model":"example"}')
      return Response.json({ text: 'sample response' }, { headers: { 'Set-Cookie': 'private=cookie' } })
    })
    vi.stubGlobal('fetch', relay)
    const original = request({ headers: { Cookie: 'session=private', 'X-Forwarded-Host': 'unexpected.example' } })
    const result = await api.fetch(original)
    const [[destination, init]] = relay.mock.calls
    expect(String(destination)).toBe(binding + path)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(Object.fromEntries(new Headers(init.headers))).toEqual({ authorization: 'Bearer test-ollama-key', 'content-type': 'application/json' })
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(result.headers.has('set-cookie')).toBe(false)
    expect(await result.json()).toEqual({ text: 'sample response' })
  })

  it.each([
    [{ route: '/api/workouts' }, 404],
    [{ method: 'GET' }, 405],
    [{ headers: { Origin: 'https://foreign.example' } }, 403],
    [{ headers: { Authorization: '' } }, 401],
  ])('rejects unauthorized or unrelated requests before calling the binding', async (input, status) => {
    const relay = vi.fn()
    vi.stubGlobal('fetch', relay)
    expect((await api.fetch(request(input))).status).toBe(status)
    expect(relay).not.toHaveBeenCalled()
  })

  it('fails closed if the runtime binding is absent', async () => {
    vi.stubEnv('COACH_INTERNAL_URL', undefined)
    const relay = vi.fn()
    vi.stubGlobal('fetch', relay)
    expect((await api.fetch(request())).status).toBe(503)
    expect(relay).not.toHaveBeenCalled()
  })

  it('checks the public loopback origin injected by Vercel dev across service ports', async () => {
    vi.stubEnv('VERCEL_ENV', 'development')
    vi.stubEnv('VERCEL_URL', '127.0.0.1:4182')
    const internal = 'http://127.0.0.1:42457' + path
    const input = request({ headers: { Origin: 'http://127.0.0.1:4182' } })
    const relay = vi.fn(async () => Response.json({ text: 'sample' }))
    vi.stubGlobal('fetch', relay)
    expect((await api.fetch(new Request(internal, input))).status).toBe(200)
    const differentPort = request({ headers: { Origin: 'http://127.0.0.1:9999', 'x-forwarded-host': '127.0.0.1:9999' } })
    expect((await api.fetch(new Request(internal, differentPort))).status).toBe(403)
    expect(relay).toHaveBeenCalledTimes(1)
  })
})
