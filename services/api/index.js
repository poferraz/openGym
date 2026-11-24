import { COACH_PATH, error, validateCoachRequest } from '../coach-http.mjs'

const unavailable = (status = 502) => error(status, 'provider_unavailable', 'The private Coach service is unavailable.')

export default {
  async fetch(request) {
    const { rejection } = validateCoachRequest(request, { checkOrigin: true })
    if (rejection) return rejection

    const base = process.env.COACH_INTERNAL_URL
    if (!base) return unavailable(503)
    try {
      const upstream = await fetch(new URL(COACH_PATH, base), {
        method: 'POST',
        headers: {
          Authorization: request.headers.get('authorization'),
          'Content-Type': request.headers.get('content-type'),
        },
        body: request.body,
        duplex: 'half',
        redirect: 'error',
        signal: request.signal,
      })
      if (!upstream.headers.get('content-type')?.startsWith('application/json')) {
        upstream.body?.cancel().catch(() => {})
        return unavailable()
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    } catch {
      return unavailable()
    }
  },
}
