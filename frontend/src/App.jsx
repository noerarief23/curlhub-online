import { useState } from 'react'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const METHOD_COLORS = {
  GET: 'text-green-500',
  POST: 'text-blue-500',
  PUT: 'text-yellow-500',
  PATCH: 'text-orange-500',
  DELETE: 'text-red-500',
}

const BODY_TYPES = ['none', 'json', 'form-data', 'x-www-form-urlencoded']

// Flags that consume the next token as a value
const FLAGS_WITH_VALUE = new Set([
  '-X', '--request', '-H', '--header', '-d', '--data', '--data-raw',
  '--data-binary', '--data-urlencode', '-u', '--user', '-A', '--user-agent',
  '-e', '--referer', '-o', '--output', '--connect-timeout', '--max-time',
  '--cert', '--key', '--cacert', '--proxy', '-F', '--form',
])

function KeyValueEditor({ items, onChange, placeholder = 'Key' }) {
  const addRow = () => onChange([...items, { key: '', value: '', enabled: true }])
  const removeRow = (i) => onChange(items.filter((_, idx) => idx !== i))
  const updateRow = (i, field, val) => {
    const updated = items.map((item, idx) => idx === i ? { ...item, [field]: val } : item)
    onChange(updated)
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => updateRow(i, 'enabled', e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
          />
          <input
            value={item.key}
            onChange={(e) => updateRow(i, 'key', e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-3 py-1.5 rounded border text-sm bg-inherit border-current/20 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            value={item.value}
            onChange={(e) => updateRow(i, 'value', e.target.value)}
            placeholder="Value"
            className="flex-1 px-3 py-1.5 rounded border text-sm bg-inherit border-current/20 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => removeRow(i)}
            className="px-2 py-1 text-red-400 hover:text-red-300 text-lg leading-none"
            title="Remove"
          >×</button>
        </div>
      ))}
      <button
        onClick={addRow}
        className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
      >
        <span className="text-lg leading-none">+</span> Add Row
      </button>
    </div>
  )
}

function JsonViewer({ data }) {
  const [collapsed, setCollapsed] = useState({})

  const toggle = (path) => setCollapsed(c => ({ ...c, [path]: !c[path] }))

  const renderValue = (val, path = '', depth = 0) => {
    if (val === null) return <span className="text-gray-400">null</span>
    if (typeof val === 'boolean') return <span className="text-yellow-400">{String(val)}</span>
    if (typeof val === 'number') return <span className="text-blue-400">{val}</span>
    if (typeof val === 'string') return <span className="text-green-400">"{val}"</span>

    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="text-gray-300">[]</span>
      const isCollapsed = collapsed[path]
      return (
        <span>
          <button onClick={() => toggle(path)} className="text-gray-400 hover:text-white">
            {isCollapsed ? '▶' : '▼'}
          </button>
          {' ['}
          {isCollapsed
            ? <span className="text-gray-400 cursor-pointer" onClick={() => toggle(path)}>{val.length} items</span>
            : (
              <div className="ml-4">
                {val.map((item, i) => (
                  <div key={i}>
                    {renderValue(item, `${path}[${i}]`, depth + 1)}
                    {i < val.length - 1 && ','}
                  </div>
                ))}
              </div>
            )}
          {']'}
        </span>
      )
    }

    if (typeof val === 'object') {
      const keys = Object.keys(val)
      if (keys.length === 0) return <span className="text-gray-300">{'{}'}</span>
      const isCollapsed = collapsed[path]
      return (
        <span>
          <button onClick={() => toggle(path)} className="text-gray-400 hover:text-white">
            {isCollapsed ? '▶' : '▼'}
          </button>
          {' {'}
          {isCollapsed
            ? <span className="text-gray-400 cursor-pointer" onClick={() => toggle(path)}>{keys.length} keys</span>
            : (
              <div className="ml-4">
                {keys.map((k, i) => (
                  <div key={k}>
                    <span className="text-purple-400">"{k}"</span>
                    <span className="text-gray-300">: </span>
                    {renderValue(val[k], `${path}.${k}`, depth + 1)}
                    {i < keys.length - 1 && ','}
                  </div>
                ))}
              </div>
            )}
          {'}'}
        </span>
      )
    }

    return <span>{String(val)}</span>
  }

  let parsed = null
  let parseError = false
  try {
    parsed = typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    parseError = true
  }

  if (parseError) {
    return <pre className="font-mono text-sm whitespace-pre-wrap break-all">{data}</pre>
  }

  return (
    <pre className="font-mono text-sm leading-relaxed overflow-auto">
      {renderValue(parsed, 'root')}
    </pre>
  )
}

// Strip surrounding quotes from a shell token
function stripQuotes(token) {
  if ((token.startsWith("'") && token.endsWith("'")) ||
      (token.startsWith('"') && token.endsWith('"'))) {
    return token.slice(1, -1)
  }
  return token
}

function parseCurl(curlStr) {
  const result = {
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    bodyType: 'none',
    bodyRaw: '',
    formData: [],
  }

  try {
    // Normalise line continuations and collapse whitespace
    const str = curlStr.trim().replace(/\\\n/g, ' ').replace(/\s+/g, ' ')

    // Tokenise respecting single/double-quoted strings
    const tokens = []
    const tokenRe = /'[^']*'|"(?:[^"\\]|\\.)*"|\S+/g
    let m
    while ((m = tokenRe.exec(str)) !== null) tokens.push(m[0])

    // First token should be 'curl' – skip it
    let i = 1

    while (i < tokens.length) {
      const token = tokens[i]

      // --- flags that take the next token as a value ---
      if (FLAGS_WITH_VALUE.has(token)) {
        const val = tokens[i + 1] ? stripQuotes(tokens[i + 1]) : ''

        if (token === '-X' || token === '--request') {
          result.method = val.toUpperCase()
        } else if (token === '-H' || token === '--header') {
          const colonIdx = val.indexOf(':')
          if (colonIdx > -1) {
            result.headers.push({
              key: val.slice(0, colonIdx).trim(),
              value: val.slice(colonIdx + 1).trim(),
              enabled: true,
            })
          }
        } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(token)) {
          const body = val
          if (result.method === 'GET') result.method = 'POST'
          try {
            JSON.parse(body)
            result.bodyType = 'json'
          } catch {
            result.bodyType = body.includes('=') ? 'x-www-form-urlencoded' : 'json'
          }
          result.bodyRaw = body
        } else if (token === '-F' || token === '--form') {
          const eqIdx = val.indexOf('=')
          if (eqIdx > -1) {
            result.formData.push({
              key: val.slice(0, eqIdx),
              value: val.slice(eqIdx + 1),
              enabled: true,
            })
            result.bodyType = 'form-data'
          }
        }

        i += 2
        continue
      }

      // --- combined short flags like -XPOST or -H"header" ---
      if (token.startsWith('-') && token.length > 2 && !token.startsWith('--')) {
        const flag = token.slice(0, 2)
        const val = stripQuotes(token.slice(2))

        if (flag === '-X') {
          result.method = val.toUpperCase()
        } else if (flag === '-H') {
          const colonIdx = val.indexOf(':')
          if (colonIdx > -1) {
            result.headers.push({
              key: val.slice(0, colonIdx).trim(),
              value: val.slice(colonIdx + 1).trim(),
              enabled: true,
            })
          }
        } else if (flag === '-d') {
          if (result.method === 'GET') result.method = 'POST'
          try {
            JSON.parse(val)
            result.bodyType = 'json'
          } catch {
            result.bodyType = val.includes('=') ? 'x-www-form-urlencoded' : 'json'
          }
          result.bodyRaw = val
        }

        i++
        continue
      }

      // --- boolean flags (no value) ---
      if (token.startsWith('-')) {
        i++
        continue
      }

      // --- positional argument: must be the URL ---
      const candidate = stripQuotes(token)
      if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
        result.url = candidate
      }

      i++
    }

    // Extract query params from URL into the params array
    if (result.url) {
      try {
        const urlObj = new URL(result.url)
        urlObj.searchParams.forEach((v, k) => {
          result.params.push({ key: k, value: v, enabled: true })
        })
        result.url = urlObj.origin + urlObj.pathname
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return result
}

// POSIX single-quote safe escape: replace ' with '\''
function shellEscape(str) {
  return String(str).replace(/'/g, "'\\''")
}

function generateCurl({ method, url, headers, params, bodyType, bodyRaw, formData }) {
  let fullUrl = url
  const enabledParams = params.filter(p => p.enabled && p.key)
  if (enabledParams.length > 0) {
    try {
      const urlObj = new URL(url)
      enabledParams.forEach(p => urlObj.searchParams.set(p.key, p.value))
      fullUrl = urlObj.toString()
    } catch {
      const qs = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
      fullUrl = `${url}?${qs}`
    }
  }

  let cmd = `curl -X ${method} '${shellEscape(fullUrl)}'`

  const enabledHeaders = headers.filter(h => h.enabled && h.key)
  enabledHeaders.forEach(h => {
    cmd += ` \\\n  -H '${shellEscape(h.key)}: ${shellEscape(h.value)}'`
  })

  if (bodyType === 'json' && bodyRaw) {
    cmd += ` \\\n  -H 'Content-Type: application/json'`
    cmd += ` \\\n  --data-raw '${shellEscape(bodyRaw)}'`
  } else if (bodyType === 'x-www-form-urlencoded' && bodyRaw) {
    cmd += ` \\\n  -H 'Content-Type: application/x-www-form-urlencoded'`
    cmd += ` \\\n  --data '${shellEscape(bodyRaw)}'`
  } else if (bodyType === 'form-data') {
    const enabledForm = formData.filter(f => f.enabled && f.key)
    enabledForm.forEach(f => {
      cmd += ` \\\n  -F '${shellEscape(f.key)}=${shellEscape(f.value)}'`
    })
  }

  return cmd
}

function StatusBadge({ code }) {
  let color = 'bg-gray-500'
  if (code >= 200 && code < 300) color = 'bg-green-600'
  else if (code >= 300 && code < 400) color = 'bg-blue-600'
  else if (code >= 400 && code < 500) color = 'bg-yellow-600'
  else if (code >= 500) color = 'bg-red-600'
  return (
    <span className={`${color} text-white text-xs font-bold px-2 py-0.5 rounded`}>{code}</span>
  )
}

export default function App() {
  const [dark, setDark] = useState(true)

  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('https://jsonplaceholder.typicode.com/todos/1')
  const [headers, setHeaders] = useState([{ key: '', value: '', enabled: true }])
  const [params, setParams] = useState([{ key: '', value: '', enabled: true }])
  const [bodyType, setBodyType] = useState('none')
  const [bodyRaw, setBodyRaw] = useState('')
  const [formData, setFormData] = useState([{ key: '', value: '', enabled: true }])

  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState(null)
  const [error, setError] = useState(null)

  const [activeTab, setActiveTab] = useState('request')
  const [curlInput, setCurlInput] = useState('')
  const [copied, setCopied] = useState('')

  const [useProxy, setUseProxy] = useState(false)

  const curlPreview = generateCurl({ method, url, headers, params, bodyType, bodyRaw, formData })

  const handleSend = async () => {
    if (!url.trim()) { setError('Please enter a URL'); return }
    setLoading(true)
    setError(null)
    setResponse(null)

    const start = Date.now()

    try {
      let fullUrl = url.trim()
      const enabledParams = params.filter(p => p.enabled && p.key)
      if (enabledParams.length > 0) {
        try {
          const urlObj = new URL(fullUrl)
          enabledParams.forEach(p => urlObj.searchParams.set(p.key, p.value))
          fullUrl = urlObj.toString()
        } catch {
          const qs = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
          fullUrl = `${fullUrl}?${qs}`
        }
      }

      const reqHeaders = {}
      headers.filter(h => h.enabled && h.key).forEach(h => {
        reqHeaders[h.key] = h.value
      })

      let body = undefined
      if (bodyType === 'json' && bodyRaw) {
        body = bodyRaw
        if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json'
      } else if (bodyType === 'x-www-form-urlencoded' && bodyRaw) {
        body = bodyRaw
        if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
      } else if (bodyType === 'form-data') {
        const fd = new FormData()
        formData.filter(f => f.enabled && f.key).forEach(f => fd.append(f.key, f.value))
        body = fd
      }

      let fetchUrl = fullUrl
      let fetchOpts = { method, headers: reqHeaders, body }

      if (useProxy) {
        const proxyBase = import.meta.env.VITE_PROXY_URL || 'http://localhost:3001'
        fetchUrl = `${proxyBase}/proxy`

        // Send form-data fields as structured payload so the backend can
        // construct the correct multipart request upstream
        let proxyPayload
        if (bodyType === 'form-data') {
          proxyPayload = {
            method,
            url: fullUrl,
            headers: reqHeaders,
            bodyType: 'form-data',
            formData: formData
              .filter(f => f.enabled && f.key)
              .map(f => ({ key: f.key, value: f.value })),
          }
        } else {
          proxyPayload = {
            method,
            url: fullUrl,
            headers: reqHeaders,
            body: bodyRaw || undefined,
          }
        }

        fetchOpts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(proxyPayload),
        }
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      try {
        const res = await fetch(fetchUrl, { ...fetchOpts, signal: controller.signal })
        clearTimeout(timeout)
        const elapsed = Date.now() - start

        const resHeaders = {}
        res.headers.forEach((v, k) => { resHeaders[k] = v })

        const contentType = res.headers.get('content-type') || ''
        const rawText = await res.text()

        // If response came from proxy it is JSON-wrapped
        let displayBody = rawText
        let displayHeaders = resHeaders
        let displayStatus = res.status
        let displayStatusText = res.statusText
        let displayTime = elapsed

        if (useProxy) {
          try {
            const proxyJson = JSON.parse(rawText)
            if (proxyJson.status) {
              displayStatus = proxyJson.status
              displayStatusText = proxyJson.statusText || ''
              displayHeaders = proxyJson.headers || {}
              displayBody = proxyJson.body || ''
              displayTime = proxyJson.time ?? elapsed
            }
          } catch { /* use raw */ }
        }

        setResponse({
          status: displayStatus,
          statusText: displayStatusText,
          headers: displayHeaders,
          body: displayBody,
          isJson: contentType.includes('application/json') || (() => { try { JSON.parse(displayBody); return true } catch { return false } })(),
          time: displayTime,
          size: new Blob([displayBody]).size,
        })
        setActiveTab('response')
      } catch (err) {
        clearTimeout(timeout)
        throw err
      }
    } catch (err) {
      const elapsed = Date.now() - start
      if (err.name === 'AbortError') {
        setError('Request timed out after 30 seconds')
      } else if (err.message && err.message.includes('CORS')) {
        setError('CORS error: The server blocked this request. Try enabling the proxy server.')
      } else {
        setError(`Request failed: ${err.message}`)
      }
      setResponse({ status: 0, time: elapsed })
    } finally {
      setLoading(false)
    }
  }

  const handleParseCurl = () => {
    if (!curlInput.trim()) return
    const parsed = parseCurl(curlInput)
    setMethod(parsed.method)
    setUrl(parsed.url)
    setHeaders(parsed.headers.length ? parsed.headers : [{ key: '', value: '', enabled: true }])
    setParams(parsed.params.length ? parsed.params : [{ key: '', value: '', enabled: true }])
    setBodyType(parsed.bodyType)
    setBodyRaw(parsed.bodyRaw)
    setFormData(parsed.formData.length ? parsed.formData : [{ key: '', value: '', enabled: true }])
    setCurlInput('')
    setActiveTab('request')
  }

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(key)
        setTimeout(() => setCopied(''), 2000)
      })
      .catch((err) => {
        console.error('Failed to copy text to clipboard:', err)
        window.alert('Failed to copy to clipboard. Please copy the text manually.')
      })
  }

  const bg = dark ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'
  const card = dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const input = dark ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
  const tab = (active) => active
    ? dark ? 'border-b-2 border-blue-500 text-blue-400 font-semibold' : 'border-b-2 border-blue-600 text-blue-600 font-semibold'
    : dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-200`}>
      {/* Header */}
      <header className={`sticky top-0 z-10 ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border-b px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <div>
            <h1 className="font-bold text-lg leading-none">cURL Online</h1>
            <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Lightweight HTTP client</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
            <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Proxy</span>
            <button
              type="button"
              onClick={() => setUseProxy(v => !v)}
              role="switch"
              aria-checked={useProxy}
              aria-label="Toggle proxy mode"
              className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${useProxy ? 'bg-blue-500' : dark ? 'bg-gray-700' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useProxy ? 'translate-x-5' : ''}`} />
            </button>
          </label>
          <button
            onClick={() => setDark(d => !d)}
            className={`p-2 rounded-lg text-lg ${dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
            title="Toggle theme"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* cURL Import */}
        <div className={`${card} border rounded-xl p-4`}>
          <label className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-gray-400' : 'text-gray-500'} mb-2 block`}>
            Import cURL Command
          </label>
          <div className="flex gap-2">
            <input
              value={curlInput}
              onChange={(e) => setCurlInput(e.target.value)}
              placeholder='Paste cURL command here… e.g. curl -X POST "https://api.example.com" -H "Content-Type: application/json" -d "{}"'
              className={`flex-1 px-3 py-2 rounded-lg border text-sm ${input} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            <button
              onClick={handleParseCurl}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
            >
              Parse
            </button>
          </div>
        </div>

        {/* URL Bar */}
        <div className={`${card} border rounded-xl p-4`}>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={`px-3 py-2.5 rounded-lg border font-bold text-sm ${input} ${METHOD_COLORS[method]} focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer`}
            >
              {HTTP_METHODS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="https://api.example.com/endpoint"
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm ${input} focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0`}
            />
            <button
              onClick={handleSend}
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white rounded-lg font-semibold text-sm transition-colors whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Sending…
                </span>
              ) : 'Send'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={`${card} border rounded-xl overflow-hidden`}>
          <div className={`flex border-b ${dark ? 'border-gray-800' : 'border-gray-200'} px-4 gap-6`}>
            {[
              { id: 'request', label: 'Request' },
              { id: 'response', label: `Response${response ? ` (${response.status})` : ''}` },
              { id: 'curl', label: 'cURL Preview' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`py-3 text-sm transition-colors ${tab(activeTab === t.id)}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Request Tab */}
            {activeTab === 'request' && (
              <div className="space-y-6">
                {/* Query Params */}
                <div>
                  <h3 className={`text-sm font-semibold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Query Parameters</h3>
                  <KeyValueEditor items={params} onChange={setParams} placeholder="Parameter" />
                </div>
                {/* Headers */}
                <div>
                  <h3 className={`text-sm font-semibold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Headers</h3>
                  <KeyValueEditor items={headers} onChange={setHeaders} placeholder="Header Name" />
                </div>
                {/* Body */}
                <div>
                  <h3 className={`text-sm font-semibold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Body</h3>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {BODY_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => setBodyType(t)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          bodyType === t
                            ? 'bg-blue-600 text-white'
                            : dark ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {bodyType === 'json' && (
                    <textarea
                      value={bodyRaw}
                      onChange={(e) => setBodyRaw(e.target.value)}
                      placeholder='{"key": "value"}'
                      rows={8}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${input} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y`}
                    />
                  )}
                  {bodyType === 'x-www-form-urlencoded' && (
                    <textarea
                      value={bodyRaw}
                      onChange={(e) => setBodyRaw(e.target.value)}
                      placeholder="key1=value1&key2=value2"
                      rows={4}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${input} focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y`}
                    />
                  )}
                  {bodyType === 'form-data' && (
                    <KeyValueEditor items={formData} onChange={setFormData} placeholder="Field Name" />
                  )}
                  {bodyType === 'none' && (
                    <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No body</p>
                  )}
                </div>
              </div>
            )}

            {/* Response Tab */}
            {activeTab === 'response' && (
              <div>
                {loading && (
                  <div className="flex items-center justify-center py-16 gap-3">
                    <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <span className={dark ? 'text-gray-400' : 'text-gray-500'}>Sending request…</span>
                  </div>
                )}
                {error && !loading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className={`${dark ? 'bg-red-950 border-red-800' : 'bg-red-50 border-red-200'} border rounded-xl p-6 max-w-lg w-full`}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                          <p className="font-semibold text-red-400 mb-1">Request Error</p>
                          <p className={`text-sm ${dark ? 'text-red-300' : 'text-red-600'}`}>{error}</p>
                          {error.includes('CORS') && (
                            <p className={`text-xs mt-2 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                              Enable the Proxy toggle in the header and make sure the backend server is running.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {!loading && !error && !response && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <span className="text-4xl">📡</span>
                    <p className={dark ? 'text-gray-400' : 'text-gray-500'}>Send a request to see the response</p>
                  </div>
                )}
                {!loading && response && response.status > 0 && (
                  <div className="space-y-4">
                    {/* Status bar */}
                    <div className={`flex flex-wrap gap-4 items-center p-3 rounded-lg ${dark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Status</span>
                        <StatusBadge code={response.status} />
                        <span className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{response.statusText}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Time</span>
                        <span className={`text-sm font-mono ${dark ? 'text-gray-200' : 'text-gray-700'}`}>{response.time}ms</span>
                      </div>
                      {response.size !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Size</span>
                          <span className={`text-sm font-mono ${dark ? 'text-gray-200' : 'text-gray-700'}`}>
                            {response.size > 1024 ? `${(response.size / 1024).toFixed(1)} KB` : `${response.size} B`}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => copyText(response.body, 'response')}
                        className={`ml-auto text-xs px-3 py-1 rounded-lg transition-colors ${
                          copied === 'response'
                            ? 'bg-green-600 text-white'
                            : dark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                      >
                        {copied === 'response' ? '✓ Copied' : '📋 Copy Response'}
                      </button>
                    </div>

                    {/* Response headers */}
                    {response.headers && Object.keys(response.headers).length > 0 && (
                      <details className={`rounded-lg border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <summary className={`px-4 py-2 cursor-pointer text-sm font-medium ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Response Headers ({Object.keys(response.headers).length})
                        </summary>
                        <div className="px-4 pb-3">
                          {Object.entries(response.headers).map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-xs py-1 border-t border-current/10">
                              <span className="text-purple-400 font-mono w-48 shrink-0">{k}</span>
                              <span className={`font-mono ${dark ? 'text-gray-300' : 'text-gray-600'} break-all`}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Response body */}
                    <div className={`rounded-lg border ${dark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'} p-4 overflow-auto max-h-[500px]`}>
                      {response.isJson ? (
                        <JsonViewer data={response.body} />
                      ) : (
                        <pre className={`text-sm whitespace-pre-wrap break-all font-mono ${dark ? 'text-gray-200' : 'text-gray-800'}`}>
                          {response.body}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* cURL Preview Tab */}
            {activeTab === 'curl' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    onClick={() => copyText(curlPreview, 'curl')}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      copied === 'curl'
                        ? 'bg-green-600 text-white'
                        : dark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {copied === 'curl' ? '✓ Copied' : '📋 Copy cURL'}
                  </button>
                </div>
                <pre className={`rounded-lg p-4 text-sm font-mono whitespace-pre-wrap break-all ${dark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'}`}>
                  {curlPreview || 'No URL specified'}
                </pre>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className={`mt-8 py-4 text-center text-xs ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
        cURL Online — Lightweight HTTP client for developers
      </footer>
    </div>
  )
}
