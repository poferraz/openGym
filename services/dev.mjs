import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'

const { default: service } = await import(pathToFileURL(resolve('index.js')).href)
const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController()
  outgoing.once('close', () => { if (!outgoing.writableEnded) controller.abort() })
  try {
    const method = incoming.method
    const request = new Request(new URL(incoming.url, `http://${incoming.headers.host}`), {
      method,
      headers: incoming.headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }),
      signal: controller.signal,
    })
    const response = await service.fetch(request)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing)
    else outgoing.end()
  } catch {
    if (outgoing.headersSent) outgoing.destroy()
    else outgoing.writeHead(500, { 'Cache-Control': 'no-store' }).end()
  }
})

server.listen(Number(process.env.PORT), '127.0.0.1')
