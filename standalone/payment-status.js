/**

 * Early payment API check — updates #serverStatus after boot loads config.

 */

;(function () {

  const LOCAL_API = 'http://127.0.0.1:8787'



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

    const el = statusEl()

    if (el) el.classList.add('hidden')

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



  function clientJwtReady() {

    const t = String(

      window.DYNA_BAKONG_CONFIG?.token || localStorage.getItem('dyna_bakong_token') || '',

    ).trim()

    return t.startsWith('eyJ')

  }



  async function probeHealth(base) {

    const ctrl = new AbortController()

    const timer = setTimeout(() => ctrl.abort(), 10000)

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

      localStorage.setItem('dyna_api_base', base.replace(/\/$/, ''))

    } catch {

      /* ignore */

    }

    hideStatus()

    window.DYNA_PAYMENT_API_READY = true

    return true

  }



  async function checkLivePreview() {
    const PUBLIC_API = 'https://dyna-store3.vercel.app'
    const bases = []

    const cfgBase = window.DynaPaymentApiBase?.apply?.() || window.DynaPaymentApiBase?.resolve?.() || ''

    if (cfgBase && !bases.includes(cfgBase)) bases.push(cfgBase)
    if (!bases.includes(PUBLIC_API)) bases.push(PUBLIC_API)
    if (!bases.includes(LOCAL_API)) bases.push(LOCAL_API)



    for (const base of bases) {

      const { reachable, data } = await probeHealth(base)

      if (!reachable || !data) continue



      const serverJwt = Boolean(data.hasJwt || data.hasToken)

      if (serverJwt || clientJwtReady()) {

        return markApiReady(base)

      }

    }



    const cfgOnly = cfgBase || ''

    if (cfgOnly) {

      const { reachable } = await probeHealth(cfgOnly)

      if (reachable && clientJwtReady()) {

        return markApiReady(cfgOnly)

      }

    }



    if (clientJwtReady()) {

      const fallback = cfgOnly || 'https://dyna-store3.vercel.app'

      return markApiReady(fallback)

    }



    setStatus(

      '<strong>Payment API.</strong> Add <code>BAKONG_TOKEN</code> on Vercel and redeploy, or run <code>npm start</code> locally. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',

      'offline',

    )

    return false

  }



  async function checkNow() {

    if (location.protocol === 'file:') {

      setStatus(

        '<strong>Wrong URL.</strong> Run <code>npm start</code> or open your Vercel site.',

        'offline',

      )

      return false

    }



    if (isLivePreview()) {

      return checkLivePreview()

    }



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



    try {

      const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' })

      const text = await res.text()

      const h = text ? JSON.parse(text) : {}

      if (h.hasJwt || h.hasToken || clientJwtReady()) {

        return markApiReady(location.origin)

      }

      setStatus(

        isVercel()

          ? '<strong>No JWT on server.</strong> Vercel → <code>BAKONG_TOKEN</code> (eyJ) + redeploy. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'

          : '<strong>No JWT.</strong> Add <code>BAKONG_TOKEN</code> to <code>.env</code> and run <code>npm start</code>. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',

        'offline',

      )

      return false

    } catch {

      if (clientJwtReady()) return markApiReady(location.origin)

      setStatus(

        hasLocalApi()

          ? '<strong>Server starting…</strong> Run <code>npm start</code>. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'

          : '<strong>Payment API offline.</strong> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',

        'offline',

      )

      return false

    }

  }



  window.DynaPaymentStatus = { checkNow, hideStatus }



  function run() {

    if (!window.DYNA_BOOT_READY) {

      window.addEventListener('dyna-boot-ready', run, { once: true })

      return

    }

    setStatus(

      '<strong>Checking payment API…</strong> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>',

      'offline',

    )

    void checkNow()

  }



  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', run)

  } else {

    run()

  }

})()


