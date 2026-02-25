'use strict'

require('dotenv').config()

const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const https = require('https')
const http = require('http')
const dns = require('dns')
const { URL } = require('url')

const app = express()
const PORT = process.env.PORT || 3001
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '30000', 10)
const MAX_RESPONSE_SIZE = parseInt(process.env.MAX_RESPONSE_SIZE || String(10 * 1024 * 1024), 10) // 10 MB
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'https://noerarief23.github.io']

// Security: disable powered-by header
app.disable('x-powered-by')

// CORS – return 403 for disallowed origins (not 500 via error handler)
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  next()
})

app.use(cors({
  origin: true, // safe: disallowed origins are already blocked above
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_MAX || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
})
app.use('/proxy', limiter)

// Body parsing (limit 1MB)
app.use(express.json({ limit: '1mb' }))

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// ---------------------------------------------------------------------------
// SSRF protection helpers
// ---------------------------------------------------------------------------

function isPrivateIp(ip) {
  const lower = ip.toLowerCase()

  // IPv4 private / special ranges
  const privateV4 = [
    /^127\.\d+\.\d+\.\d+$/,                                        // loopback 127.0.0.0/8
    /^10\.\d+\.\d+\.\d+$/,                                         // RFC1918 10/8
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,                        // RFC1918 172.16-31/12
    /^192\.168\.\d+\.\d+$/,                                        // RFC1918 192.168/16
    /^169\.254\.\d+\.\d+$/,                                        // link-local 169.254/16
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/,         // CGNAT 100.64/10
    /^0\.0\.0\.0$/,                                                 // unspecified
  ]
  if (privateV4.some(r => r.test(lower))) return true

  // IPv6 private / special ranges
  if (lower === '::1') return true              // loopback
  if (lower === '::') return true               // unspecified
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true  // ULA fc00::/7
  if (lower.startsWith('fe80')) return true     // link-local fe80::/10
  // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7)
    if (privateV4.some(r => r.test(v4))) return true
  }

  return false
}

async function isBlockedUrl(urlStr) {
  try {
    const parsed = new URL(urlStr)
    const hostname = parsed.hostname.toLowerCase()

    // Block non-http(s) schemes
    if (!['http:', 'https:'].includes(parsed.protocol)) return true

    // Block obvious literals
    const obviousBlocked = ['localhost', '0.0.0.0', '[::1]', '[::ffff:127.0.0.1]']
    if (obviousBlocked.includes(hostname)) return true

    // Strip brackets from IPv6 literals
    const rawIp = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname

    // Block if it is already a private IP literal
    if (isPrivateIp(rawIp)) return true

    // DNS-resolve the hostname and check all returned addresses
    try {
      const addresses = await new Promise((resolve, reject) => {
        dns.lookup(hostname, { all: true, family: 0 }, (err, addrs) => {
          if (err) reject(err)
          else resolve(addrs)
        })
      })
      if (addresses.some(a => isPrivateIp(a.address))) return true
    } catch {
      // DNS lookup failed – block to be safe
      return true
    }

    return false
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------
// Header sanitisation
// ---------------------------------------------------------------------------

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
  'host', 'content-length',
])

function sanitizeHeaders(headers = {}) {
  const clean = {}
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase()
    if (!HOP_BY_HOP.has(lower) && typeof v === 'string') {
      // Prevent header injection
      const safeKey = k.replace(/[\r\n]/g, '')
      const safeVal = String(v).replace(/[\r\n]/g, '')
      if (safeKey.length > 0 && safeKey.length <= 256 && safeVal.length <= 8192) {
        clean[safeKey] = safeVal
      }
    }
  }
  return clean
}

// ---------------------------------------------------------------------------
// Multipart form-data builder (for form-data proxy requests)
// ---------------------------------------------------------------------------

function buildMultipartBody(fields) {
  const boundary = `----FormBoundary${Date.now()}`
  let body = ''
  for (const { key, value } of fields) {
    body += `--${boundary}\r\n`
    body += `Content-Disposition: form-data; name="${String(key).replace(/"/g, '\\"')}"\r\n`
    body += `\r\n`
    body += `${value}\r\n`
  }
  body += `--${boundary}--\r\n`
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

// ---------------------------------------------------------------------------
// Proxy endpoint
// ---------------------------------------------------------------------------

app.post('/proxy', async (req, res) => {
  const { method, url: targetUrl, headers = {}, body, bodyType, formData } = req.body || {}

  // Input validation
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing URL' })
  }
  if (targetUrl.length > 2048) {
    return res.status(400).json({ error: 'URL too long' })
  }
  if (await isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
  }

  const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  const upperMethod = (method || 'GET').toUpperCase()
  if (!ALLOWED_METHODS.includes(upperMethod)) {
    return res.status(400).json({ error: 'Invalid HTTP method' })
  }

  const cleanHeaders = sanitizeHeaders(headers)

  // Determine request body and content-type
  let requestBody
  let contentType

  if (bodyType === 'form-data' && Array.isArray(formData) && formData.length > 0) {
    const built = buildMultipartBody(formData)
    requestBody = built.body
    contentType = built.contentType
  } else if (body && typeof body === 'string' && body.length <= 1024 * 1024) {
    requestBody = body
    contentType = cleanHeaders['content-type'] || cleanHeaders['Content-Type']
  }

  // Override content-type if we built one
  if (contentType) cleanHeaders['content-type'] = contentType

  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' })
  }

  const isHttps = parsed.protocol === 'https:'
  const transport = isHttps ? https : http

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: upperMethod,
    headers: {
      ...cleanHeaders,
      host: parsed.hostname,
      ...(requestBody ? { 'content-length': Buffer.byteLength(requestBody) } : {}),
    },
    timeout: TIMEOUT_MS,
  }

  const startTime = Date.now()

  const proxyReq = transport.request(options, (proxyRes) => {
    const chunks = []
    let totalSize = 0

    proxyRes.on('data', (chunk) => {
      totalSize += chunk.length
      if (totalSize > MAX_RESPONSE_SIZE) {
        proxyReq.destroy()
        proxyRes.destroy()
        if (!res.headersSent) {
          res.status(502).json({ error: `Response too large (limit: ${MAX_RESPONSE_SIZE} bytes)` })
        }
        return
      }
      chunks.push(chunk)
    })

    proxyRes.on('end', () => {
      if (res.headersSent) return
      const elapsed = Date.now() - startTime
      const responseBody = Buffer.concat(chunks).toString('utf8')

      // Do not log request/response bodies (only method + hostname + path prefix for debugging)
      console.log(`[proxy] ${upperMethod} ${parsed.hostname} -> ${proxyRes.statusCode} (${elapsed}ms)`)

      res.json({
        status: proxyRes.statusCode,
        statusText: proxyRes.statusMessage,
        headers: proxyRes.headers,
        body: responseBody,
        time: elapsed,
      })
    })
  })

  proxyReq.on('timeout', () => {
    proxyReq.destroy()
    if (!res.headersSent) res.status(504).json({ error: 'Request timed out' })
  })

  proxyReq.on('error', (err) => {
    // Log error code only, not message (may contain sensitive URL details)
    console.error(`[proxy] Error: ${err.code || 'ECONNFAILED'}`)
    if (!res.headersSent) {
      res.status(502).json({ error: `Proxy error: ${err.code || 'connection failed'}` })
    }
  })

  if (requestBody) {
    proxyReq.write(requestBody)
  }
  proxyReq.end()
})

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }))

// Error handler
app.use((err, req, res, _next) => {
  console.error(`[error] ${err.code || err.message}`)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`[server] cURL Online proxy running on port ${PORT}`)
})

module.exports = app
