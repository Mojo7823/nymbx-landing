// Dev-only stand-in for Gotenberg's POST /forms/libreoffice/convert route,
// backed by a local LibreOffice (`soffice`) — the same engine Gotenberg wraps.
// Use it when Docker isn't available:
//
//   npm run gotenberg:mock          # listens on http://localhost:3100
//   npm run dev                     # vite proxies /api/convert/* to it
//
// With Docker, prefer the real thing: docker compose -f deploy/docker-compose.yml up
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileP = promisify(execFile)
const PORT = Number(process.env.PORT ?? 3100)
// Override when soffice isn't on PATH (e.g. a user-local LibreOffice).
const SOFFICE = process.env.SOFFICE_BIN ?? 'soffice'
// Mirrors the `request_body max_size 30MB` limit Caddy enforces in production.
const MAX_BODY = 30 * 1024 * 1024

async function readBody(req, res) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) {
      res.writeHead(413).end('Request Entity Too Large')
      req.destroy()
      return null
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function convert(req, res) {
  const body = await readBody(req, res)
  if (body === null) return

  // Node's fetch primitives parse the multipart form for us.
  const form = await new Request('http://mock/', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? '' },
    body,
  }).formData()
  const file = form.getAll('files').find((f) => f instanceof File)
  if (!file) {
    res.writeHead(400).end('no files field')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'mock-gotenberg-'))
  try {
    const input = join(dir, file.name.replaceAll('/', '_'))
    await writeFile(input, Buffer.from(await file.arrayBuffer()))
    // Separate user profile per request so concurrent runs don't clash.
    await execFileP(SOFFICE, [
      `-env:UserInstallation=${pathToFileURL(join(dir, 'profile'))}`,
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      dir,
      input,
    ])
    const pdf = await readFile(input.replace(/\.[^.]+$/, '') + '.pdf')
    res.writeHead(200, { 'content-type': 'application/pdf' }).end(pdf)
  } catch (err) {
    console.error('conversion failed:', err.message)
    res.writeHead(400).end('conversion failed')
  } finally {
    // Like Gotenberg, leave nothing behind after the response.
    await rm(dir, { recursive: true, force: true })
  }
}

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/forms/libreoffice/convert') {
    convert(req, res).catch((err) => {
      console.error(err)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"up"}')
  } else {
    res.writeHead(404).end()
  }
}).listen(PORT, () => {
  console.log(`mock gotenberg (soffice) listening on http://localhost:${PORT}`)
})
