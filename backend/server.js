'use strict'

require('dotenv').config()

const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const https = require('https')
const http = require('http')
const { URL } = require('url')

const app = express()
const PORT = process.env.PORT || 3001
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '30000', 10)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'https://noerarief23.github.io']

// Security: disable powered-by header
app.disable('x-powered-by')

// CORS
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
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

// Validate URL - block private/internal ranges
function isBlockedUrl(urlStr) {
  try {
    const parsed = new URL(urlStr)
    const hostname = parsed.hostname.toLowerCase()

    // Block non-http(s) schemes
    if (!['http:', 'https:'].includes(parsed.protocol)) return true

    // Block localhost and loopback
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) return true

    // Block private IP ranges
    const privateRanges = [
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^169\.254\.\d+\.\d+$/,
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/,
    ]
    if (privateRanges.some(r => r.test(hostname))) return true

    return false
  } catch {
    return true
  }
}

// Sanitize headers - remove hop-by-hop and dangerous headers
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

// Proxy endpoint
app.post('/proxy', (req, res) => {
  const { method, url: targetUrl, headers = {}, body } = req.body || {}

  // Input validation
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing URL' })
  }
  if (targetUrl.length > 2048) {
    return res.status(400).json({ error: 'URL too long' })
  }
  if (isBlockedUrl(targetUrl)) {
    return res.status(403).json({ error: 'URL not allowed' })
  }

  const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  const upperMethod = (method || 'GET').toUpperCase()
  if (!ALLOWED_METHODS.includes(upperMethod)) {
    return res.status(400).json({ error: 'Invalid HTTP method' })
  }

  const cleanHeaders = sanitizeHeaders(headers)
  const requestBody = body && typeof body === 'string' && body.length <= 1024 * 1024
    ? body
    : undefined

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
    proxyRes.on('data', (chunk) => chunks.push(chunk))
    proxyRes.on('end', () => {
      const elapsed = Date.now() - startTime
      const responseBody = Buffer.concat(chunks).toString('utf8')

      // Do not log request/response bodies (security)
      console.log(`[proxy] ${upperMethod} ${parsed.hostname}${parsed.pathname} -> ${proxyRes.statusCode} (${elapsed}ms)`)

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
    res.status(504).json({ error: 'Request timed out' })
  })

  proxyReq.on('error', (err) => {
    // Log error without sensitive details
    console.error(`[proxy] Error: ${err.code || err.message}`)
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
  console.error(`[error] ${err.message}`)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`[server] cURL Online proxy running on port ${PORT}`)
})

module.exports = app
