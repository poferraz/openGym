export const COACH_PATH = '/api/coach-plan'
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export function error(status, code, message, headers) {
  return json({ code, error: message }, status, headers)
}

function allowedOrigin(request) {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return false

  // Vercel dev proxies the public loopback address to a different port for each service.
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'development' && process.env.VERCEL_URL) {
    if (!origin || !URL.canParse(origin) || !LOOPBACK.has(url.hostname)) return false
    const page = new URL(origin)
    return page.origin === origin && ['http:', 'https:'].includes(page.protocol) &&
      LOOPBACK.has(page.hostname) && page.host === process.env.VERCEL_URL
  }
  if (origin !== url.origin) return false
  if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV === 'development') {
    return ['http:', 'https:'].includes(url.protocol) && LOOPBACK.has(url.hostname)
  }
  return url.protocol === 'https:' && [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].includes(url.host)
}

export function validateCoachRequest(request, { checkOrigin = false } = {}) {
  if (new URL(request.url).pathname !== COACH_PATH) return { rejection: error(404, 'not_found', 'Route not found.') }
  if (request.method !== 'POST') return { rejection: error(405, 'invalid_request', 'Use POST for this endpoint.', { Allow: 'POST' }) }
  if (checkOrigin && !allowedOrigin(request)) {
    return { rejection: error(403, 'forbidden_origin', 'Open this request from the openGym Personal site.') }
  }
  const key = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~+/-]{8,1024}={0,2})$/i)?.[1]
  if (!key) return { rejection: error(401, 'invalid_key', 'Enter an Ollama Cloud API key.') }
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') return { rejection: error(415, 'invalid_request', 'Send a JSON request.') }
  return { key }
}
