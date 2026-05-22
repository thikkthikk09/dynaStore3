/**
 * Payment API status — updates #serverStatus after boot.
 */
;(function () {
  const PUBLIC_API = 'https://dyna-store3.vercel.app'
  const LOCAL_API = 'http://127.0.0.1:8787'
  const RELAY_KEY = 'dyna_relay_url'
  const PROBE_MS = 4500

  let checkInFlight = false

  function statusEl() {
    return document.getElementById('serverStatus')
  }

  function setStatus(html, mode) {
    const el = statusEl()
    if (!el) return
    el.classList.remove('hidden')
    el.classList.toggle('server-status--offline', mode === 'offline')
    el.classList.toggle('server-status--ok', mode === 'ok')
    el.innerHTML = html
  }

  function hideStatus() {
    statusEl()?.classList.add('hidden')
  }

  function relayUrl() {
    try {
      return String(localStorage.getItem(RELAY_KEY) || window.Khqr?.getRelayUrl?.() || '').trim().replace(/\/$/, '')
    } catch {
      return ''
    }
  }

  function showRelayBanner(show) {
    const el = document.getElementById('relaySetupBanner')
    if (!el) return
    el.classList.toggle('hidden', !show)
    if (show) {
      const input = document.getElementById('topupRelayUrl')
      if (input && !input.value) input.value = relayUrl()
    }
  }

  async function applyRelayUrl(url, statusEl) {
    const base = String(url || '').trim().replace(/\/$/, '')
    if (!base.startsWith('https://')) {
      setStatus('<strong>Invalid URL.</strong> Use https://… from <code>npm run relay</code>', 'offline')
      return false
    }
    if (statusEl) statusEl.textContent = 'Testing relay…'
    const ok = (await window.Khqr?.testRelayHealth?.(base)) ?? false
    if (!ok) {
      setStatus(
        `<strong>Relay not reachable.</strong> Run <code>npm run relay</code> on your PC, copy the HTTPS link, then Save again.`,
        'offline',
      )
      return false
    }
    try {
      localStorage.setItem(RELAY_KEY, base)
    } catch {
      /* ignore */
    }
    const relayInput = document.getElementById('bakongRelay')
    if (relayInput) relayInput.value = base
    window.Khqr?.saveSettings?.()
    showRelayBanner(false)
    hideStatus()
    window.DYNA_PAYMENT_API_READY = true
    try {
      sessionStorage.removeItem('dyna_bakong_cloud_blocked')
    } catch {
      /* ignore */
    }
    void window.Khqr?.resumePendingTopup?.()
    return true
  }

  function bindRelayBanner() {
    document.getElementById('saveRelayBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('saveRelayBtn')
      const url = document.getElementById('topupRelayUrl')?.value?.trim() || ''
      if (btn) btn.disabled = true
      await applyRelayUrl(url, null)
      if (btn) btn.disabled = false
    })
  }

  async function tryAutoRelayFromBoot() {
    const auto = String(window.DYNA_RELAY_AUTO?.relayUrl || '').trim().replace(/\/$/, '')
    const stored = relayUrl()
    const candidate = stored || auto
    if (!candidate.startsWith('https://')) return false
    return applyRelayUrl(candidate, null)
  }

  function hasLocalApi() {
    const h = location.hostname
    return (h === '127.0.0.1' || h === 'localhost') && location.protocol.startsWith('http')
  }

  function isLivePreview() {
    return (
      window.DYNA_LIVE_PREVIEW ||
      /serverWindowId=/.test(location.search) ||
      location.port === '3000' ||
      location.port === '5500' ||
      location.port === '5173'
    )
  }

  function isVercel() {
    return /\.vercel\.app$/i.test(location.hostname)
  }

  function bakongCfg() {
    const file = window.DYNA_BAKONG_CONFIG || {}
    const runtime = window.DYNA_RUNTIME_CONFIG || {}
    const t = String(file.token || runtime.token || '').trim()
    const r = String(file.registerToken || runtime.registerToken || '').trim()
    if (t.startsWith('rbk') && r.startsWith('eyJ')) {
      return { ...file, ...runtime, token: r, registerToken: t }
    }
    return { ...file, ...runtime }
  }

  function defaultApiBase() {
    return (
      window.DynaPaymentApiBase?.resolve?.() ||
      bakongCfg().apiBase ||
      bakongCfg().publicSiteUrl ||
      PUBLIC_API
    ).replace(/\/$/, '')
  }

  function clientJwtReady() {
    const t = String(bakongCfg().token || localStorage.getItem('dyna_bakong_token') || '').trim()
    return t.startsWith('eyJ')
  }

  function clientRegisterReady() {
    return String(bakongCfg().registerToken || '').trim().startsWith('rbk')
  }

  function clientEmail() {
    return String(bakongCfg().email || localStorage.getItem('dyna_bakong_email') || '').trim()
  }

  function storeClientJwt(jwt) {
    if (!jwt?.startsWith('eyJ')) return false
    localStorage.setItem('dyna_bakong_token', jwt)
    window.DYNA_BAKONG_CONFIG = { ...(window.DYNA_BAKONG_CONFIG || {}), token: jwt }
    return true
  }

  function syncTokenFromConfig() {
    const cfg = bakongCfg()
    if (cfg.token?.startsWith('eyJ')) return storeClientJwt(cfg.token)
    return false
  }

  async function renewClientJwt() {
    const email = clientEmail()
    if (!email || !clientRegisterReady()) return false
    const cfg = bakongCfg()
    const renewBody = {
      email,
      organization: cfg.organization || 'Dyna Store',
      project: cfg.project || 'dyna_store',
      token: cfg.registerToken,
    }

    try {
      const res = await fetch('https://api-bakong.nbc.gov.kh/v1/renew_token', {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renewBody),
      })
      const json = await res.json()
      if (json.responseCode === 0 && json.data?.token?.startsWith('eyJ')) {
        return storeClientJwt(json.data.token)
      }
    } catch (e) {
      console.warn('renewClientJwt direct', e)
    }

    const base = defaultApiBase()
    try {
      const res = await fetch(`${base}/api/renew-token`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renewBody),
      })
      const json = await res.json()
      if (json.responseCode === 0 && json.data?.token?.startsWith('eyJ')) {
        return storeClientJwt(json.data.token)
      }
    } catch (e) {
      console.warn('renewClientJwt proxy', e)
    }
    return false
  }

  async function ensureClientJwt() {
    syncTokenFromConfig()
    if (clientJwtReady()) return true
    return renewClientJwt()
  }

  async function probeHealth(base) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PROBE_MS)
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/health`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: ctrl.signal,
      })
      const text = await res.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        return { reachable: false, data: null, status: res.status }
      }
      return { reachable: res.ok, data, status: res.status }
    } catch {
      return { reachable: false, data: null, status: 0 }
    } finally {
      clearTimeout(timer)
    }
  }

  function markApiReady(base) {
    try {
      localStorage.setItem('dyna_api_base', String(base || defaultApiBase()).replace(/\/$/, ''))
    } catch {
      /* ignore */
    }
    window.DYNA_PAYMENT_API_READY = true
    hideStatus()
    return true
  }

  /** Instant path — do not wait on slow / dead hosts */
  async function tryQuickReady() {
    syncTokenFromConfig()
    const base = defaultApiBase()
    if (isVercel() && relayUrl()) return markApiReady(relayUrl())
    if (isVercel()) return false
    if (clientJwtReady()) return markApiReady(base)

    if (clientRegisterReady() && clientEmail()) {
      const renewed = await Promise.race([
        renewClientJwt(),
        new Promise((resolve) => setTimeout(() => resolve(false), PROBE_MS)),
      ])
      if (renewed || clientJwtReady()) return markApiReady(base)
    }

    return false
  }

  function basesToProbe() {
    const list = [defaultApiBase(), PUBLIC_API]
    if (location.port === '8787' || (hasLocalApi() && !isLivePreview())) {
      list.push(LOCAL_API)
    }
    return [...new Set(list.filter(Boolean))]
  }

  async function probeAnyHealth() {
    const bases = basesToProbe()
    const probes = await Promise.all(
      bases.map(async (base) => {
        const result = await probeHealth(base)
        return { base, ...result }
      }),
    )
    for (const p of probes) {
      if (!p.reachable) continue
      if (p.data?.hasJwt || p.data?.hasToken || clientJwtReady()) {
        return markApiReady(p.base)
      }
    }
    return false
  }

  async function checkLivePreview() {
    if (await tryQuickReady()) return true
    if (await probeAnyHealth()) return true
    if (await tryQuickReady()) return true

    setStatus(
      '<strong>Payment API.</strong> Run <code>npm start</code> or set Vercel env vars → redeploy. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',
      'offline',
    )
    return false
  }

  async function checkNow() {
    if (hasLocalApi() && location.port === '8787') {
      showRelayBanner(false)
      hideStatus()
      window.DYNA_PAYMENT_API_READY = true
      return true
    }

    if (location.protocol === 'file:') {
      setStatus(
        '<strong>Wrong URL.</strong> Open <a href="https://dyna-store3.vercel.app">dyna-store3.vercel.app</a> or run <code>npm start</code>.',
        'offline',
      )
      return false
    }

    if (isLivePreview()) return checkLivePreview()

    if (
      location.protocol.startsWith('http') &&
      !hasLocalApi() &&
      !isVercel() &&
      !location.hostname.endsWith('.github.io')
    ) {
      setStatus(
        '<strong>Payment API.</strong> Deploy to <a href="https://vercel.com" target="_blank" rel="noopener">Vercel</a> or run <code>npm start</code>.',
        'offline',
      )
      return false
    }

    if (await tryQuickReady()) return true

    if (isVercel()) {
      if (relayUrl()) {
        const ok = await (window.Khqr?.testRelayHealth?.(relayUrl()) ?? false)
        if (ok) {
          showRelayBanner(false)
          return markApiReady(relayUrl())
        }
      }
      if (await tryAutoRelayFromBoot()) return true
      const pubHealth = await probeHealth(PUBLIC_API)
      if (pubHealth.data?.bakongBlocked || pubHealth.data?.hint?.includes('403')) {
        showRelayBanner(true)
        setStatus(
          '<strong>Bakong blocks Vercel.</strong> On your PC: <code>npm run relay</code> → copy HTTPS link → paste below → Save relay. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',
          'offline',
        )
        return false
      }
      if (await probeAnyHealth()) return true
      if (await tryQuickReady()) return true
      showRelayBanner(true)
      setStatus(
        '<strong>Payments need a relay.</strong> On your PC run <code>npm run relay</code>, copy the HTTPS link, paste in yellow box → Save relay. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',
        'offline',
      )
      return false
    }

    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), PROBE_MS)
      const res = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      const h = await res.json()
      if (h.hasJwt || h.hasToken) return markApiReady(location.origin)
    } catch {
      /* fall through */
    }

    if (await tryQuickReady()) return markApiReady(location.origin)
    if (await probeAnyHealth()) return true

    setStatus(
      hasLocalApi()
        ? '<strong>Run npm start</strong> then refresh. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
        : '<strong>Payment API offline.</strong> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',
      'offline',
    )
    return false
  }

  async function runCheck(showBanner) {
    if (checkInFlight) return window.DYNA_PAYMENT_API_READY
    if (window.DYNA_PAYMENT_API_READY) {
      hideStatus()
      return true
    }
    checkInFlight = true
    if (showBanner) {
      setStatus(
        '<strong>Checking payment API…</strong> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',
        'offline',
      )
    }
    try {
      return await checkNow()
    } finally {
      checkInFlight = false
    }
  }

  window.DynaPaymentStatus = {
    checkNow: () => runCheck(false),
    hideStatus,
    runCheck,
  }

  function bindRetry() {
    statusEl()?.addEventListener('click', (e) => {
      if (e.target.id !== 'serverRetry') return
      void runCheck(true)
    })
  }

  function run() {
    if (!window.DYNA_BOOT_READY) {
      window.addEventListener('dyna-boot-ready', run, { once: true })
      return
    }
    bindRetry()
    bindRelayBanner()
    void runCheck(true)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
