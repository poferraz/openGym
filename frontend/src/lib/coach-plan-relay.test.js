import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/coach-plan.js'

const origin = 'https://opengym-personal.vercel.app'
const body = {
  model: 'gpt-oss:20b',
  profile: {
    goal: 'Build muscle',
    experience: 'Beginner',
    weeklySessions: 3,
    optionalSession: true,
    sessionMinutes: 45,
    equipment: ['dumbbell'],
    preferences: '',
    constraints: 'No bench available',
    recentPerformance: [{ id: '0014', reps: 10, weight: 12, unit: 'kg' }],
  },
  exercises: [{ id: '0014', name: 'Dumbbell Row', equipment: 'dumbbell', muscle: 'back' }],
}

function request(payload = body, headers = {}, url = origin, method = 'POST') {
  return new Request(url + '/api/coach-plan', {
    method,
    headers: {
      origin,
      authorization: 'Bearer test-ollama-key',
      'content-type': 'application/json',
      ...headers,
    },
    body: method === 'POST' ? JSON.stringify(payload) : undefined,
  })
}

function vercelHost() {
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'opengym-personal.vercel.app')
  vi.stubEnv('VERCEL_URL', 'unique-build.vercel.app')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('personal Coach Cloud relay', () => {
  it('forwards approved workout inputs to Ollama Cloud with the user’s key and returns model text', async () => {
    vercelHost()
    const text = '{"routines":[]}'
    const upstream = vi.fn(async () => Response.json({
      model: body.model, message: { role: 'assistant', content: text }, done: true, done_reason: 'stop',
    }))
    vi.stubGlobal('fetch', upstream)

    const response = await handler.fetch(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(await response.json()).toEqual({ text })

    const [[url, options]] = upstream.mock.calls
    expect(url).toBe('https://ollama.com/api/chat')
    expect(options.method).toBe('POST')
    expect(options.redirect).toBe('error')
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer test-ollama-key')
    const upstreamBody = JSON.parse(options.body)
    expect(upstreamBody).toMatchObject({ model: body.model, stream: false })
    expect(upstreamBody).not.toHaveProperty('format')
    expect(upstreamBody.messages[0].content).toMatch(/full-body/i)
    expect(upstreamBody.messages[0].content).toContain('repsMin')
    expect(JSON.parse(upstreamBody.messages[1].content)).toEqual({ profile: body.profile, exercises: body.exercises })
  })

  it('rejects a foreign Origin even if a forwarded host matches it', async () => {
    vercelHost()
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)

    const response = await handler.fetch(request(body, {
      origin: 'https://other.example',
      'x-forwarded-host': 'other.example',
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'forbidden_origin' })
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects a spoofed URL and Origin outside the Vercel deployment hosts', async () => {
    vercelHost()
    const response = await handler.fetch(request(body, { origin: 'https://other.example' }, 'https://other.example'))
    expect(response.status).toBe(403)
  })

  it('allows a same-origin loopback request for local Vercel development', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'development')
    vi.stubGlobal('fetch', async () => Response.json({ message: { content: '[]' } }))
    const local = 'http://localhost:3000'

    expect((await handler.fetch(request(body, { origin: local }, local))).status).toBe(200)
  })

  it.each([
    { ...body, userId: 'do not send' },
    { ...body, profile: { ...body.profile, dateOfBirth: 'do not send' } },
    { ...body, profile: { ...body.profile, recentPerformance: [{ id: '0014', reps: 10, unit: 'kg', date: 'do not send' }] } },
    { ...body, exercises: [{ ...body.exercises[0], photos: ['do not send'] }] },
    { ...body, profile: { ...body.profile, recovery: 'x'.repeat(1024) } },
  ])('rejects unauthorized or oversized profile data', async (payload) => {
    vercelHost()
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)

    expect((await handler.fetch(request(payload))).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('caps the body even when Content-Length is omitted', async () => {
    vercelHost()
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)

    const response = await handler.fetch(request({ padding: 'x'.repeat(80 * 1024) }))
    expect(response.status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each([
    [401, 401, 'invalid_key'],
    [403, 401, 'invalid_key'],
    [429, 429, 'quota'],
    [404, 400, 'model_unavailable'],
    [500, 502, 'provider_unavailable'],
  ])('sanitizes an Ollama failure (%s)', async (upstreamStatus, status, code) => {
    vercelHost()
    vi.stubGlobal('fetch', async () => new Response('provider internals and test-ollama-key', { status: upstreamStatus }))

    const response = await handler.fetch(request())
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const result = await response.json()
    expect(result.code).toBe(code)
    expect(result.error).not.toContain('test-ollama-key')
    expect(result.error).not.toContain('provider internals')
  })

  it('caps and sanitizes provider output', async () => {
    vercelHost()
    vi.stubGlobal('fetch', async () => Response.json({ message: { content: 'x'.repeat(150 * 1024) } }))

    const response = await handler.fetch(request())
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ code: 'provider_unavailable' })
  })

  it('rejects a successful provider reply that echoes the request credential', async () => {
    vercelHost()
    vi.stubGlobal('fetch', async () => Response.json({ message: { content: 'echo test-ollama-key' } }))

    const response = await handler.fetch(request())
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('test-ollama-key')
  })

  it('reports deadline expiry separately from other network failures', async () => {
    vercelHost()
    const expired = AbortSignal.abort(new DOMException('Deadline passed', 'TimeoutError'))
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(expired)
    vi.stubGlobal('fetch', async (_url, { signal }) => signal.throwIfAborted())

    const response = await handler.fetch(request())
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({ code: 'timeout' })
  })

  it('rejects missing keys, preflights and non-JSON bodies without using the provider', async () => {
    vercelHost()
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)

    expect((await handler.fetch(request(body, { authorization: '' }))).status).toBe(401)
    expect((await handler.fetch(request(body, {}, origin, 'OPTIONS'))).status).toBe(405)
    expect((await handler.fetch(request(body, { 'content-type': 'text/plain' }))).status).toBe(415)
    expect(upstream).not.toHaveBeenCalled()
  })
})
