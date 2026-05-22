/**
 * Resolve payment API host — never use Live Preview port (3000) as API URL.
 */
;(function (global) {
  const API_BASE_KEY = 'dyna_api_base'
  const PREVIEW_PORTS = new Set(['3000', '5500', '5173', '4173'])
  const DEFAULT_VERCEL_API = 'https://dyna-store3.vercel.app'

  function isLivePreview() {
    if (global.DYNA_LIVE_PREVIEW) return true
    if (typeof location === 'undefined') return false
    return (
      /serverWindowId=/.test(location.search) ||
      PREVIEW_PORTS.has(location.port)
    )
  }

  function isInvalidApiBase(url) {
    const raw = String(url || '').trim()
    if (!raw) return true
    try {
      const u = new URL(raw)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return true
      const host = u.hostname
      const port = u.port || (u.protocol === 'https:' ? '443' : '80')
      if (host !== '127.0.0.1' && host !== 'localhost') return false
      if (PREVIEW_PORTS.has(port)) return true
      if (typeof location !== 'undefined' && port === location.port && isLivePreview()) {
        return true
      }
      return false
    } catch {
      return true
    }
  }

  const LOCAL_DEV_API = 'http://127.0.0.1:8787'

  function publicApiBase() {
    const cfg = global.DYNA_BAKONG_CONFIG || {}
    return String(cfg.publicSiteUrl || cfg.apiBase || DEFAULT_VERCEL_API)
      .trim()
      .replace(/\/$/, '')
  }

  function resolvePaymentApiBase() {
    const cfg = global.DYNA_BAKONG_CONFIG || {}
    const stored = global.localStorage?.getItem(API_BASE_KEY)
    const pub = publicApiBase()
    const candidates = isLivePreview()
      ? [pub, cfg.apiBase, stored, LOCAL_DEV_API, global.DYNA_RUNTIME_CONFIG?.apiBase]
      : [
          stored,
          typeof location !== 'undefined' && location.port === '8787' ? LOCAL_DEV_API : '',
          cfg.apiBase,
          pub,
          global.DYNA_RUNTIME_CONFIG?.apiBase,
          global.DYNA_RUNTIME_CONFIG?.siteUrl,
        ]
    for (const c of candidates) {
      const base = String(c || '')
        .trim()
        .replace(/\/$/, '')
      if (base && !isInvalidApiBase(base)) return base
    }
    return DEFAULT_VERCEL_API
  }

  function applyPaymentApiBase() {
    if (typeof global.localStorage === 'undefined') return resolvePaymentApiBase()
    const stored = global.localStorage.getItem(API_BASE_KEY)
    if (stored && isInvalidApiBase(stored)) {
      global.localStorage.removeItem(API_BASE_KEY)
    }
    const base = resolvePaymentApiBase()
    if (base) global.localStorage.setItem(API_BASE_KEY, base)
    return base
  }

  /** Headers required for localtunnel (*.loca.lt) from the browser */
  function relayHeaders(extra) {
    return {
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      'bypass-tunnel-reminder': 'true',
      ...(extra || {}),
    }
  }

  function isTunnelHost(url) {
    return /\.loca\.lt$|ngrok|trycloudflare\.com/i.test(String(url || ''))
  }

  async function fetchRelay(url, init) {
    const headers = relayHeaders(init?.headers)
    return fetch(url, { ...init, headers })
  }

  global.DynaRelay = {
    headers: relayHeaders,
    fetch: fetchRelay,
    isTunnelHost,
  }

  global.DynaPaymentApiBase = {
    resolve: resolvePaymentApiBase,
    apply: applyPaymentApiBase,
    isInvalid: isInvalidApiBase,
    isLivePreview,
    publicUrl: publicApiBase,
  }
})(typeof window !== 'undefined' ? window : global)
