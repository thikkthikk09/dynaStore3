/**
 * Bakong KHQR — EMV payload, MD5 payment check (Bakong Open API).
 * Register token: https://api-bakong.nbc.gov.kh/register
 */
;(function (global) {
  const KHR_PER_USD = 4100
  /** localStorage keys — do not put your JWT or account here */
  const TOKEN_KEY = 'dyna_bakong_token'
  const PROXY_KEY = 'dyna_bakong_proxy'
  const ACCOUNT_KEY = 'dyna_bakong_account'
  const EMAIL_KEY = 'dyna_bakong_email'
  const PENDING_KEY = 'dyna_pending_topup'
  const CREDITED_KEY = 'dyna_credited_md5'
  const HISTORY_KEY = 'dyna_payment_history'
  const LAST_CHECK_KEY = 'dyna_last_md5_check'
  const API_BASE_KEY = 'dyna_api_base'
  const QR_EXPIRE_MS = 10 * 60 * 1000
  const DEMO_ACCOUNT = 'dynastore@bkrt'
  const LOCAL_PROXY_ORIGIN = typeof location !== 'undefined' && location.origin ? location.origin : ''
  /** Same-origin paths on Vercel / local server (never localhost when deployed). */
  const API_CHECK_MD5 = '/api/check-md5'
  const API_HEALTH = '/api/health'
  const LOCAL_DEV_API = 'http://127.0.0.1:8787'
  const PUBLIC_DEV_API = 'https://dyna-store3.vercel.app'
  let activeProxyOrigin = null
  let useRelativeApi = false

  function isLocalDev() {
    if (typeof location === 'undefined') return false
    const h = location.hostname
    return h === '127.0.0.1' || h === 'localhost'
  }

  function isGitHubPages() {
    if (typeof location === 'undefined') return false
    return location.hostname.endsWith('.github.io')
  }

  function isVercelHost() {
    if (typeof location === 'undefined') return false
    const h = location.hostname
    return h.endsWith('.vercel.app') || h.endsWith('.vercel.sh')
  }

  function isLivePreviewHost() {
    if (typeof global !== 'undefined' && global.DYNA_LIVE_PREVIEW) return true
    if (typeof location === 'undefined') return false
    return (
      /serverWindowId=/.test(location.search) ||
      location.port === '3000' ||
      location.port === '5500' ||
      location.port === '5173'
    )
  }

  /** Use same-origin /api/check-md5 (works on Vercel, npm start, any host with /api). */
  function useRelativePaymentApi() {
    if (typeof location === 'undefined') return false
    if (!location.protocol.startsWith('http')) return false
    if (isGitHubPages()) return false
    return true
  }

  function configuredSiteUrl() {
    const stored = String(localStorage.getItem(API_BASE_KEY) || '')
      .trim()
      .replace(/\/$/, '')
    if (stored && !global.DynaPaymentApiBase?.isInvalid?.(stored)) return stored
    const resolved = global.DynaPaymentApiBase?.resolve?.()
    if (resolved) return resolved
    const cfg = configDefaults()
    const raw = String(cfg.apiBase || cfg.siteUrl || '')
      .trim()
      .replace(/\/$/, '')
    if (raw && global.DynaPaymentApiBase?.isInvalid?.(raw)) return ''
    if (isLivePreviewHost() && (!raw || raw === location?.origin)) {
      return String(cfg.publicSiteUrl || cfg.apiBase || PUBLIC_DEV_API || '')
        .trim()
        .replace(/\/$/, '')
    }
    return raw
  }

  function paymentApiOrigin() {
    if (typeof location === 'undefined') return configuredSiteUrl()
    const site = configuredSiteUrl()
    if (isLivePreviewHost() && site) return site
    if (isVercelHost() || (useRelativePaymentApi() && !isLivePreviewHost())) {
      return location.origin
    }
    if (isGitHubPages()) return site || location.origin
    return site || location.origin
  }

  function isSameOriginApiHost() {
    return useRelativePaymentApi()
  }

  function migratePaymentStorage() {
    if (typeof localStorage === 'undefined') return
    const proxy = String(localStorage.getItem(PROXY_KEY) || '')
    const onDeployed =
      (isVercelHost() || isGitHubPages()) &&
      !isLivePreviewHost()
    if (onDeployed && (proxy.includes('127.0.0.1') || proxy.includes('localhost'))) {
      localStorage.removeItem(PROXY_KEY)
    }
    const apiBase = String(localStorage.getItem(API_BASE_KEY) || '')
    if (onDeployed && (apiBase.includes('127.0.0.1') || apiBase.includes('localhost'))) {
      localStorage.removeItem(API_BASE_KEY)
    }
    if (isLivePreviewHost()) {
      global.DynaPaymentApiBase?.apply?.()
    }
  }

  function isStaticHosting() {
    return isGitHubPages() || (typeof location !== 'undefined' && !isLocalDev())
  }

  function configApiBase() {
    return paymentApiOrigin()
  }

  /** Bakong API rejects Authorization header from browser origins (CORS). Use /api/check-md5 proxy. */
  function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
  }

  function hasJwtForPayment() {
    return getApiCredential().startsWith('eyJ')
  }

  function canUseDirectBakong() {
    return !isBrowser() && hasJwtForPayment()
  }

  function paymentJwtReady() {
    return serverHasJwt || hasJwtForPayment()
  }

  function fixSwappedBakongConfig(cfg) {
    const t = String(cfg.token || '').trim()
    const r = String(cfg.registerToken || '').trim()
    if (t.startsWith('rbk') && r.startsWith('eyJ')) {
      cfg.token = r
      cfg.registerToken = t
      global.DYNA_BAKONG_CONFIG = { ...(global.DYNA_BAKONG_CONFIG || {}), ...cfg }
      console.warn('Fixed swapped token / registerToken in Bakong config')
    }
    return cfg
  }

  function applyConfigCredentials() {
    migratePaymentStorage()
    const cfg = fixSwappedBakongConfig(configDefaults())
    if (cfg.token?.startsWith('eyJ')) {
      localStorage.setItem(TOKEN_KEY, cfg.token)
      serverHasJwt = true
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = cfg.token
    } else if (isRegisterCode(cfg.registerToken)) {
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = cfg.registerToken
    }
    if (cfg.email) {
      localStorage.setItem(EMAIL_KEY, cfg.email)
      document.querySelectorAll('#bakongEmail, .bakong-email-sync').forEach((el) => {
        el.value = cfg.email
      })
    }
    if (cfg.account) {
      localStorage.setItem(ACCOUNT_KEY, cfg.account)
      const acc = document.getElementById('bakongAccount')
      if (acc) acc.value = cfg.account
    }
  }

  /** Renew JWT via same-origin /api/renew-token (Vercel + local server). */
  async function renewJwtDirect() {
    const email = getBakongEmail()
    if (!email) return ''
    const cfg = configDefaults()
    const rbk = getRegisterCode()
    const body = {
      email,
      organization: cfg.organization || 'Dyna Store',
      project: cfg.project || 'dyna_store',
    }
    if (rbk) body.token = rbk

    const renewUrl = isBrowser()
      ? resolveProxyRenew()
      : `${PAYMENT_CHECK.apiBase}/v1/renew_token`

    let json = null
    try {
      const direct = await fetch(`${PAYMENT_CHECK.apiBase}/v1/renew_token`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      json = await direct.json()
    } catch {
      /* try proxy */
    }
    if (!json || json.errorCode === 6 || json._bakongHttp === 403) {
      try {
        const res = await fetch(renewUrl, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        json = await res.json()
      } catch {
        return ''
      }
    }
    if (json.responseCode === 0 && json.data?.token?.startsWith('eyJ')) {
      const jwt = json.data.token
      localStorage.setItem(TOKEN_KEY, jwt)
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = jwt
      return jwt
    }
    return ''
  }

  async function probeDirectBakong() {
    if (!hasJwtForPayment()) return false
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(`${PAYMENT_CHECK.apiBase}/v1/check_transaction_by_md5`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getApiCredential()}`,
        },
        body: JSON.stringify({ md5: '00000000000000000000000000000000' }),
        signal: ctrl.signal,
      })
      const json = await res.json()
      return json.responseCode !== undefined || json.errorCode !== undefined
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Check MD5 from the shopper's browser (not Vercel's IP).
   * Bakong often blocks cloud servers but allows normal browsers — fixes public-site top-up.
   */
  async function requestBakongMd5FromBrowser(bearer, md5, qr) {
    const hash = String(md5 || '').toLowerCase()
    if (!bearer.startsWith('eyJ') || !/^[a-f0-9]{32}$/.test(hash)) return null

    const list = md5Variants(hash, qr).slice(0, 12)

    let lastJson = null
    let matched = hash
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 22000)
    try {
      for (const h of list) {
        try {
          const res = await fetch(`${PAYMENT_CHECK.apiBase}/v1/check_transaction_by_md5`, {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bearer}`,
            },
            body: JSON.stringify({ md5: h }),
            signal: ctrl.signal,
          })
          const json = await res.json()
          lastJson = json
          matched = h
          if (isBakongPaid(json)) {
            return {
              ...json,
              _dyna: {
                paid: true,
                md5: h,
                direct: true,
                hasJwt: true,
                apiOrigin: 'browser',
              },
            }
          }
        } catch (err) {
          if (err.name === 'AbortError') break
          console.warn('direct Bakong MD5', h, err)
        }
      }
    } finally {
      clearTimeout(timer)
    }

    if (!lastJson) return null
    return {
      ...lastJson,
      _dyna: {
        paid: isBakongPaid(lastJson),
        md5: matched,
        direct: true,
        hasJwt: true,
        apiOrigin: 'browser',
      },
    }
  }

  const MERCHANT = {
    name: 'DYNA STORE',
    city: 'PHNOM PENH',
    /** Your real Bakong ID, e.g. myshop@aba — must exist in Bakong */
    account: 'ben_sothida@bkrt',
    mcc: '5999',
    /** 840 = USD (matches $ prices in UI); use '116' for KHR-only */
    currency: '840',
    merchantDisplayName: 'Dyna Store',
    merchantCity: 'Phnom Penh',
  }

  const PAYMENT_CHECK = {
    apiBase: 'https://api-bakong.nbc.gov.kh',
    pollIntervalMs: 1500,
    maxPollMs: 10 * 60 * 1000,
    pendingMaxMs: 7 * 24 * 60 * 60 * 1000,
    demoWhenNoToken: false,
  }

  /** No JWT — Bakong MD5 API cannot verify payment */
  function useSimplePaymentFlow() {
    return !getToken()
  }

  function addPaymentHistory(md5, usd, qr) {
    const hash = String(md5 || '').toLowerCase()
    if (!/^[a-f0-9]{32}$/.test(hash)) return
    let list = []
    try {
      list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      if (!Array.isArray(list)) list = []
    } catch {
      list = []
    }
    const payload = String(qr || '').trim()
    list = list.filter((x) => x.md5 !== hash)
    list.push({
      md5: hash,
      usd: Number(usd) || 0.01,
      qr: payload,
      at: Date.now(),
    })
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-30)))
  }

  function md5Variants(md5, qr) {
    const out = []
    const add = (h) => {
      const x = String(h || '').toLowerCase()
      if (/^[a-f0-9]{32}$/.test(x) && !out.includes(x)) out.push(x)
      const upper = x.toUpperCase()
      if (/^[A-F0-9]{32}$/.test(upper) && !out.includes(upper)) out.push(upper)
    }
    add(md5)
    if (!qr || typeof global.md5 !== 'function') return out

    const q = String(qr).trim()
    add(global.md5(q))
    if (q.toUpperCase() !== q) add(global.md5(q.toUpperCase()))
    if (q.toLowerCase() !== q) add(global.md5(q.toLowerCase()))
    if (q.length > 4) add(global.md5(q.slice(0, -4)))
    if (q.length > 8) add(global.md5(q.slice(0, -8)))
    const crcTag = q.lastIndexOf('6304')
    if (crcTag > 0) {
      add(global.md5(q.slice(0, crcTag)))
      if (q.length >= crcTag + 8) add(global.md5(q.slice(0, crcTag + 8)))
    }
    return out
  }

  function isBakongPaid(json) {
    if (!json || typeof json !== 'object') return false
    if (json._dyna?.paid === true) return true
    if (parsePaymentStatus(json) === 'paid') return true
    const msg = String(json.responseMessage || '')
    if (json.responseCode === 0 && /getting transaction successfully/i.test(msg)) return true
    if (json.responseCode === 0 && json.data != null) {
      const tx = json.data?.transaction ?? json.data
      if (Array.isArray(tx) && tx.length > 0) {
        return tx.some((row) => row && (row.fromAccountId || row.hash || Number(row.amount) > 0))
      }
      if (tx && typeof tx === 'object') {
        const amt = Number(tx.amount)
        if (
          tx.fromAccountId ||
          tx.hash ||
          tx.toAccountId ||
          (Number.isFinite(amt) && amt > 0)
        ) {
          return true
        }
      }
      if (/successfully|completed|paid/i.test(msg)) return true
    }
    if (Number(json.errorCode) === 3) return false
    return false
  }

  function usdFromBakongData(json, fallbackUsd) {
    const tx = json?.data?.transaction ?? json?.data
    const row = Array.isArray(tx) ? tx[0] : tx
    const amt = Number(row?.amount)
    if (!Number.isFinite(amt) || amt <= 0) return Number(fallbackUsd) || 0.01
    const cur = String(row?.currency || '').toUpperCase()
    if (cur === 'KHR' || cur === '116') return Number(fallbackUsd) || 0.01
    return amt
  }

  function usdForMd5(md5) {
    const hash = String(md5 || '').toLowerCase()
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null')
      if (pending?.md5 === hash && pending.usd) return Number(pending.usd)
    } catch {
      /* ignore */
    }
    const hit = getPaymentHistory().find((x) => x.md5 === hash)
    if (hit?.usd) return Number(hit.usd)
    return Number(currentUsd) || 0.01
  }

  function getPaymentHistory() {
    try {
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  function savePendingTopup() {
    if (!currentMd5 || !currentUsd) return
    const record = {
      md5: currentMd5,
      usd: currentUsd,
      qr: currentPayload || '',
      at: Date.now(),
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(record))
    addPaymentHistory(currentMd5, currentUsd, currentPayload)
  }

  function saveLastCheck(md5, status, detail) {
    localStorage.setItem(
      LAST_CHECK_KEY,
      JSON.stringify({ md5, status, detail, at: Date.now() }),
    )
  }

  function clearPendingTopup() {
    localStorage.removeItem(PENDING_KEY)
  }

  function loadCreditedMd5Set() {
    try {
      const arr = JSON.parse(localStorage.getItem(CREDITED_KEY) || '[]')
      if (Array.isArray(arr)) arr.forEach((m) => creditedMd5.add(String(m).toLowerCase()))
    } catch {
      /* ignore */
    }
  }

  function markMd5Credited(md5) {
    const key = String(md5 || '').toLowerCase()
    if (!key) return
    creditedMd5.add(key)
    const list = [...creditedMd5]
    localStorage.setItem(CREDITED_KEY, JSON.stringify(list.slice(-50)))
  }

  function creditBalanceDirect(amount) {
    const amt = Number(amount) || 0
    if (amt <= 0) return 0
    let total
    if (global.DynaWallet?.addBalance) {
      total = global.DynaWallet.addBalance(amt)
    } else {
      const key = 'dyna_wallet_usd'
      const bal = Number(localStorage.getItem(key))
      total = (Number.isFinite(bal) && bal >= 0 ? bal : 0) + amt
      localStorage.setItem(key, String(total))
    }
    if (typeof global.renderWallet === 'function') global.renderWallet(true)
    if (typeof global.onDynaTopupSuccess === 'function') {
      global.onDynaTopupSuccess(amt, { balance: total })
    }
    try {
      global.dispatchEvent(
        new CustomEvent('dyna-wallet-updated', { detail: { added: amt, balance: total } }),
      )
    } catch {
      /* ignore */
    }
    global.showKhqrToast?.(`+${formatUsd(amt)} added · Balance $${Number(total).toFixed(2)}`)
    return total
  }

  function applyTopupCredit(usd, md5, data) {
    const key = String(md5 || '').toLowerCase() || `manual-${usd}-${Date.now()}`
    if (creditedMd5.has(key)) return false
    markMd5Credited(key)
    clearPendingTopup()
    paymentCredited = true
    const amount = usdFromBakongData({ data }, usd) || Number(usd) || Number(currentUsd) || 0.01
    creditBalanceDirect(amount)
    updatePendingBanner(false)
    return true
  }

  async function requestPaymentCheck(body) {
    applyConfigCredentials()
    let token = getApiCredential()
    if (!token.startsWith('eyJ') && getRegisterCode()) {
      token = await renewJwtDirect()
    }
    if (!token.startsWith('eyJ')) {
      throw new Error('NO_TOKEN')
    }
    const bearer = token
    const qr = String(body?.qr || body?.QR || currentPayload || '').trim()
    const md5 = String(body?.md5 || '').toLowerCase()
    const payload = {
      ...body,
      md5,
      qr: qr || undefined,
      md5List: /^[a-f0-9]{32}$/.test(md5) ? md5Variants(md5, qr).slice(0, 12) : undefined,
      token: bearer.startsWith('eyJ') ? bearer : undefined,
    }
    const urls = paymentCheckUrls()
    if (!urls.length && !bearer.startsWith('eyJ')) throw new Error('PROXY_OFFLINE')

    const preferBrowser =
      bearer.startsWith('eyJ') &&
      /^[a-f0-9]{32}$/.test(md5) &&
      (isVercelHost() || isGitHubPages() || isStaticHosting())

    if (preferBrowser) {
      const directFirst = await requestBakongMd5FromBrowser(bearer, md5, qr)
      if (directFirst && isBakongPaid(directFirst)) return directFirst
    }

    let lastJson = null
    let lastOrigin = ''
    let sawBlocked = false
    const relayUrl = String(configDefaults().relayUrl || global.DYNA_RUNTIME_CONFIG?.relayUrl || '')
      .trim()
      .replace(/\/$/, '')
    if (relayUrl && isPaymentApiOrigin(relayUrl)) {
      urls.unshift(`${relayUrl}${API_CHECK_MD5}`)
    }

    for (const proxy of urls) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 25000)
      try {
        const res = await fetch(proxy, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        })
        const json = await readProxyJson(res)
        lastJson = json
        const origin = proxy.replace(/\/api\/check-md5$/i, '')
        lastOrigin = origin
        if (json._dyna?.hasJwt) {
          serverHasJwt = true
          markProxyOnline(origin, true)
        }
        if (isBakongBlockedResponse(json)) {
          sawBlocked = true
        } else {
          const paid = isBakongPaid(json)
          return {
            ...json,
            _dyna: {
              ...(json._dyna || {}),
              paid,
              hasJwt: Boolean(json._dyna?.hasJwt) || serverHasJwt || hasJwtForPayment(),
              proxy: true,
              apiOrigin: origin,
            },
          }
        }
      } catch (err) {
        console.warn('payment check', proxy, err)
      } finally {
        clearTimeout(timer)
      }
    }

    if (bearer.startsWith('eyJ') && /^[a-f0-9]{32}$/.test(md5) && (sawBlocked || !lastJson || !isBakongPaid(lastJson))) {
      const direct = await requestBakongMd5FromBrowser(bearer, md5, qr)
      if (direct && (isBakongPaid(direct) || !isBakongBlockedResponse(direct))) return direct
    }

    if (lastJson) {
      const paid = isBakongPaid(lastJson)
      return {
        ...lastJson,
        _dyna: {
          ...(lastJson._dyna || {}),
          paid,
          hasJwt: Boolean(lastJson._dyna?.hasJwt) || serverHasJwt || hasJwtForPayment(),
          proxy: true,
          apiOrigin: lastOrigin,
        },
      }
    }
    throw new Error('PROXY_OFFLINE')
  }

  async function checkMd5AndCredit(md5, usd, bakongHash) {
    const hash = String(md5 || '').toLowerCase()
    if (!/^[a-f0-9]{32}$/.test(hash)) return false
    if (creditedMd5.has(hash)) return false

    const hist = getPaymentHistory().find((x) => x.md5 === hash)
    const qr = hist?.qr || currentPayload || ''
    const creditUsd = Number(usd) || usdForMd5(hash)

    currentMd5 = hash
    currentUsd = creditUsd
    if (qr) currentPayload = qr

    applyConfigCredentials()
    await discoverProxy()
    if (!hasJwtForPayment()) await renewJwtDirect()
    if (!hasPaymentApi()) {
      saveLastCheck(hash, 'error', 'Payment API offline — run npm start')
      return false
    }

    const tryCredit = async (json) => {
      const st = isBakongPaid(json) ? 'paid' : parsePaymentStatus(json)
      const matchedMd5 = json?._dyna?.md5 || hash
      saveLastCheck(matchedMd5, st, json?.responseMessage || '')
      if (isBakongPaid(json)) {
        const paidUsd = usdFromBakongData(json, creditUsd)
        return applyTopupCredit(paidUsd, matchedMd5, json?.data)
      }
      return false
    }

    try {
      let json = await requestPaymentCheck({
        md5: hash,
        qr,
        bakongHash: bakongHash || undefined,
        usd: creditUsd,
        amount: creditUsd,
      })
      if (await tryCredit(json)) return true

      let st = parsePaymentStatus(json)
      if (st === 'no_token' || st === 'unauthorized') {
        await warmServerJwt()
        await renewJwtDirect()
        json = await requestPaymentCheck({
          md5: hash,
          qr,
          bakongHash: bakongHash || undefined,
          usd: creditUsd,
        })
        if (await tryCredit(json)) return true
      }

      if (bakongHash) {
        const ok = await checkByBakongHash(bakongHash, creditUsd)
        if (ok) return true
      }
    } catch (err) {
      saveLastCheck(hash, 'error', String(err.message || err))
      console.warn('checkMd5AndCredit', err)
    }
    return false
  }

  async function checkByBakongHash(bakongHash, usd) {
    const h = String(bakongHash || '').trim().toLowerCase()
    if (h.length < 8 || !/^[a-f0-9]+$/.test(h)) return false
    applyConfigCredentials()
    await discoverProxy()
    if (!hasJwtForPayment()) await renewJwtDirect()
    try {
      const json = await requestPaymentCheck({ bakongHash: h, usd: Number(usd) || 0.01 })
      if (!isBakongPaid(json)) return false
      const creditUsd = Number(usd) || currentUsd || 0.01
      const md5 = json?._dyna?.md5 || currentMd5 || h
      return applyTopupCredit(usdFromBakongData(json, creditUsd), md5, json?.data)
    } catch (err) {
      console.warn('checkByBakongHash', err)
      return false
    }
  }

  async function scanAllPendingPayments() {
    const list = getPaymentHistory().slice().reverse()
    for (const item of list) {
      if (!item?.md5 || creditedMd5.has(item.md5)) continue
      const ok = await checkMd5AndCredit(item.md5, item.usd)
      if (ok) return true
    }
    return false
  }

  async function checkAllPaymentHistory() {
    applyConfigCredentials()
    await discoverProxy()
    await discoverProxy()
    if (!hasJwtForPayment()) await renewJwtDirect()

    const list = getPaymentHistory().slice().reverse()
    for (const item of list) {
      const ok = await checkMd5AndCredit(item.md5, item.usd)
      if (ok) return true
    }
    return false
  }

  async function resumePendingTopup() {
    const history = getPaymentHistory()
    const raw = localStorage.getItem(PENDING_KEY)
    updatePendingBanner(Boolean(raw || history.length))

    if (raw) {
      try {
        const pending = JSON.parse(raw)
        if (pending.qr) currentPayload = pending.qr
        if (pending.md5) currentMd5 = pending.md5
        if (pending.usd) currentUsd = pending.usd
        if (Date.now() - pending.at <= PAYMENT_CHECK.pendingMaxMs) {
          const ok = await checkMd5AndCredit(pending.md5, pending.usd)
          if (ok) return true
        }
      } catch {
        clearPendingTopup()
      }
    }

    const ok = await checkAllPaymentHistory()
    if (ok) return true

    if (raw && !paymentCredited && !pollTimer) {
      try {
        const pending = JSON.parse(raw)
        currentMd5 = pending.md5
        currentUsd = pending.usd
        void startPolling()
      } catch {
        /* ignore */
      }
    }
    return false
  }

  function updatePendingBanner(show) {
    const el = document.getElementById('pendingTopupBanner')
    if (!el) return
    const history = getPaymentHistory()
    const shouldShow = show || history.length > 0
    el.classList.toggle('hidden', !shouldShow)

    const raw = localStorage.getItem(PENDING_KEY)
    let usd = currentUsd || 0.01
    let md5 = currentMd5
    try {
      if (raw) {
        const p = JSON.parse(raw)
        usd = p.usd ?? usd
        md5 = p.md5 || md5
      } else if (history.length) {
        usd = history[history.length - 1].usd
        md5 = history[history.length - 1].md5
      }
    } catch {
      /* ignore */
    }

    const amtEl = el.querySelector('.pending-topup-amount')
    if (amtEl) amtEl.textContent = formatUsd(usd)

    const md5El = document.getElementById('pendingMd5Display')
    if (md5El) {
      md5El.textContent = md5 ? `${md5.slice(0, 8)}…${md5.slice(-4)}` : '—'
      md5El.title = md5 || ''
    }

    const statusEl = document.getElementById('pendingCheckStatus')
    if (statusEl) {
      try {
        const last = JSON.parse(localStorage.getItem(LAST_CHECK_KEY) || '{}')
        if (last.status === 'paid') statusEl.textContent = 'Bakong: paid — balance updated'
        else if (last.status === 'error') statusEl.textContent = 'Check failed — retry or paste MD5 from QR'
        else if (last.detail) statusEl.textContent = `Bakong: ${last.detail}`
        else statusEl.textContent = 'Checking with Bakong every 1.5s…'
      } catch {
        statusEl.textContent = 'Tap button below after you paid'
      }
    }

    const input = document.getElementById('manualMd5Input')
    if (input && md5 && !input.value) input.value = md5
  }

  function verifyKhqr(payload) {
    if (global.BakongKhqrLite?.verify) return global.BakongKhqrLite.verify(payload)
    return false
  }

  function configDefaults() {
    const file = global.DYNA_BAKONG_CONFIG || {}
    const runtime = global.DYNA_RUNTIME_CONFIG || {}
    const site = String(runtime.siteUrl || runtime.apiBase || file.apiBase || '')
      .trim()
      .replace(/\/$/, '')
    const pageOrigin =
      typeof location !== 'undefined' && location.protocol.startsWith('http')
        ? location.origin.replace(/\/$/, '')
        : site
    const origin =
      isLivePreviewHost() && site
        ? site
        : isVercelHost() || (isLocalDev() && !isLivePreviewHost() && location?.protocol?.startsWith('http'))
          ? pageOrigin
          : site || pageOrigin

    const publicSite = String(file.publicSiteUrl || file.apiBase || PUBLIC_DEV_API).replace(/\/$/, '')

    return {
      ...file,
      ...runtime,
      publicSiteUrl: publicSite,
      siteUrl: isLivePreviewHost() ? publicSite : site || pageOrigin,
      apiBase: isGitHubPages() || isLivePreviewHost() ? publicSite : file.apiBase || '',
      paymentCheckUrl:
        runtime.paymentCheckUrl || (origin ? `${origin}/api/check-md5` : '/api/check-md5'),
      webhookUrl: runtime.webhookUrl || (origin ? `${origin}/api/webhook` : '/api/webhook'),
      healthUrl: runtime.healthUrl || (origin ? `${origin}/api/health` : '/api/health'),
      proxy: String(runtime.proxy ?? file.proxy ?? '').trim(),
      token: runtime.token || file.token || '',
      email: runtime.email || file.email || '',
      registerToken: runtime.registerToken || file.registerToken || '',
      relayUrl: runtime.relayUrl || file.relayUrl || '',
      account: runtime.account || file.account || '',
      organization: runtime.organization || file.organization || 'Dyna Store',
      project: runtime.project || file.project || 'dyna_store',
    }
  }

  function paymentHelpMessage() {
    if (isVercelHost()) {
      return 'Set BAKONG_TOKEN and DYNA_SITE_URL on Vercel → redeploy, then try top-up again'
    }
    if (isLocalDev()) {
      return 'Run npm start — or copy .env.example to .env and deploy to Vercel'
    }
    return 'Open your Vercel URL (not localhost) for live top-up'
  }

  function getBakongAccount() {
    const input = document.getElementById('bakongAccount')
    const fromConfig = configDefaults().account
    const typed = String(input?.value || '').trim()
    return (
      typed ||
      localStorage.getItem(ACCOUNT_KEY) ||
      fromConfig ||
      MERCHANT.account
    ).trim()
  }

  function isInvalidAccount(account) {
    return !account || account === DEMO_ACCOUNT || !/^[^\s@]+@[^\s@]+$/.test(account)
  }

  function buildKhqrLocal(usdAmount) {
    const account = getBakongAccount()
    if (isInvalidAccount(account)) {
      throw new Error('INVALID_ACCOUNT')
    }

    if (!global.BakongKhqrLite) {
      throw new Error('KHQR generator missing')
    }

    const currency = MERCHANT.currency
    const amount =
      currency === '116'
        ? Math.round(Number(usdAmount) * KHR_PER_USD)
        : Number(usdAmount)

    const result = global.BakongKhqrLite.generateIndividual({
      bakongAccountID: account,
      merchantName: MERCHANT.merchantDisplayName || MERCHANT.name,
      merchantCity: MERCHANT.merchantCity || 'Phnom Penh',
      amount,
      currency,
    })

    const qr = result.qr
    const md5 = String(result.md5 || hashMd5(qr) || '').toLowerCase()
    return { qr, md5 }
  }

  async function buildKhqr(usdAmount) {
    const account = getBakongAccount()
    if (isInvalidAccount(account)) {
      throw new Error('INVALID_ACCOUNT')
    }

    const bases = paymentCheckUrls()
      .map((u) => u.replace(/\/api\/check-md5$/i, ''))
      .filter((b, i, a) => a.indexOf(b) === i)

    for (const base of bases) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(`${base}/api/khqr-build`, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usd: Number(usdAmount),
            account,
            merchantName: MERCHANT.merchantDisplayName || MERCHANT.name,
            merchantCity: MERCHANT.merchantCity || 'Phnom Penh',
            currency: MERCHANT.currency,
          }),
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        if (!res.ok) continue
        const built = await res.json()
        if (built?.qr && /^[a-f0-9]{32}$/.test(String(built.md5 || ''))) {
          return { qr: built.qr, md5: String(built.md5).toLowerCase() }
        }
      } catch {
        /* try next host or local fallback */
      }
    }

    return buildKhqrLocal(usdAmount)
  }

  function hashMd5(qrString) {
    if (typeof global.md5 !== 'function') return ''
    return String(global.md5(qrString)).toLowerCase()
  }

  function formatKhr(usd) {
    const khr = Math.round(Number(usd) * KHR_PER_USD)
    return '៛' + khr.toLocaleString('en-US')
  }

  function formatUsd(usd) {
    return '$' + Number(usd).toFixed(2)
  }

  function isRegisterCode(token) {
    const t = String(token || '').trim()
    return t.startsWith('rbk') && !t.startsWith('eyJ')
  }

  function getRegisterCode() {
    const cfg = configDefaults()
    if (isRegisterCode(cfg.registerToken)) return cfg.registerToken
    if (isRegisterCode(cfg.token)) return cfg.token
    return isRegisterCode(getTokenRaw()) ? getTokenRaw() : ''
  }

  function needsJwtActivation() {
    const jwt = getToken()
    return Boolean(getRegisterCode()) && !jwt.startsWith('eyJ')
  }

  function pickJwt(...values) {
    for (const v of values) {
      const t = String(v || '').trim()
      if (t.startsWith('eyJ')) return t
    }
    return ''
  }

  function getTokenRaw() {
    const cfg = configDefaults()
    const jwt = pickJwt(cfg.token, document.getElementById('bakongToken')?.value, localStorage.getItem(TOKEN_KEY))
    if (jwt) return jwt
    return String(document.getElementById('bakongToken')?.value || localStorage.getItem(TOKEN_KEY) || cfg.token || '').trim()
  }

  /** JWT only (eyJ…) — empty when only rbk register code is set */
  function getToken() {
    const cfg = configDefaults()
    return pickJwt(cfg.token, document.getElementById('bakongToken')?.value, localStorage.getItem(TOKEN_KEY))
  }

  /** JWT only — rbk codes do not work for check_transaction_by_md5 */
  function getApiCredential() {
    return getToken()
  }

  function hasApiCredential() {
    return Boolean(getToken())
  }

  function getBakongEmail() {
    const fromConfig = configDefaults().email
    const input =
      document.getElementById('bakongEmail') ||
      document.querySelector('.bakong-email-sync')
    return (fromConfig || input?.value || localStorage.getItem(EMAIL_KEY) || '').trim()
  }

  function getProxyUrl() {
    return resolveProxyUrl()
  }

  function isPaymentApiOrigin(origin) {
    const raw = String(origin || '').trim().replace(/\/$/, '')
    if (!raw) return false
    if (global.DynaPaymentApiBase?.isInvalid?.(raw)) return false
    try {
      const u = new URL(raw)
      const port = u.port || (u.protocol === 'https:' ? '443' : '80')
      if (isLivePreviewHost() && (port === '3000' || port === '5500' || port === '5173')) {
        return false
      }
      return true
    } catch {
      return false
    }
  }

  function proxyOriginsToTry() {
    const list = []
    const pub = String(configDefaults().publicSiteUrl || configDefaults().apiBase || PUBLIC_DEV_API)
      .trim()
      .replace(/\/$/, '')
    if (isLivePreviewHost() || isGitHubPages()) {
      if (isPaymentApiOrigin(pub)) list.push(pub)
    }
    const stored = String(localStorage.getItem(API_BASE_KEY) || '')
      .trim()
      .replace(/\/$/, '')
    if (isPaymentApiOrigin(stored)) list.push(stored)
    const origin = paymentApiOrigin()
    if (isPaymentApiOrigin(origin)) list.push(origin)
    if (!isLivePreviewHost() && !isVercelHost()) list.push(LOCAL_DEV_API)
    if (isLocalDev() && isPaymentApiOrigin(location?.origin)) list.push(location.origin)
    return [...new Set(list.filter(Boolean))]
  }

  function isBakongBlockedResponse(json) {
    if (!json || typeof json !== 'object') return true
    if (isBakongPaid(json)) return false
    const msg = String(json.responseMessage || json.error || '')
    return /invalid bakong|invalid api response|blocked cloud|HTTP 403|non-JSON|empty api|cannot reach bakong|relay bad/i.test(
      msg,
    )
  }

  function hasPaymentApi() {
    return paymentCheckUrls().length > 0
  }

  function paymentCheckUrls() {
    const urls = []
    for (const origin of proxyOriginsToTry()) {
      urls.push(`${origin.replace(/\/$/, '')}${API_CHECK_MD5}`)
    }
    if (useRelativePaymentApi() && isLocalDev() && !isLivePreviewHost()) {
      urls.unshift(API_CHECK_MD5)
    }
    if (!isLivePreviewHost() && !urls.some((u) => u.includes('127.0.0.1:8787'))) {
      urls.push(`${LOCAL_DEV_API}${API_CHECK_MD5}`)
    }
    const cfg = configDefaults()
    if (cfg.paymentCheckUrl && !urls.includes(cfg.paymentCheckUrl)) {
      urls.push(cfg.paymentCheckUrl)
    }
    return [...new Set(urls.filter(Boolean))]
  }

  function proxyBase() {
    return activeProxyOrigin || paymentApiOrigin() || (typeof location !== 'undefined' ? location.origin : '')
  }

  /**
   * Payment check — always same host as the page (never hardcoded 127.0.0.1).
   * Local: same-origin /api/check-md5 (npm start)
   * Vercel: https://dyna-store36.vercel.app/api/check-md5
   * GitHub Pages: https://dyna-store36.vercel.app/api/check-md5 (from apiBase)
   */
  function resolveProxyUrl() {
    if (activeProxyOrigin === 'direct') return ''
    const cfg = configDefaults()
    if (isGitHubPages() || isLivePreviewHost()) {
      useRelativeApi = false
      const origin = paymentApiOrigin()
      const url = cfg.paymentCheckUrl || `${origin}${API_CHECK_MD5}`
      return url.startsWith('http') ? url : `${origin}${API_CHECK_MD5}`
    }
    useRelativeApi = true
    return API_CHECK_MD5
  }

  function resolveProxyHealth() {
    const cfg = configDefaults()
    if (isGitHubPages() || isLivePreviewHost()) {
      const origin = paymentApiOrigin()
      const url = cfg.healthUrl || `${origin}${API_HEALTH}`
      return url.startsWith('http') ? url : `${origin}${API_HEALTH}`
    }
    return API_HEALTH
  }

  function resolveProxyRenew() {
    return `${proxyBase()}/api/renew-token`
  }

  function resolveProxySetEmail() {
    return `${proxyBase()}/api/set-email`
  }

  async function probeApiOrigin(origin) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    try {
      const res = await fetch(`${origin.replace(/\/$/, '')}/api/health`, {
        method: 'GET',
        mode: 'cors',
        signal: ctrl.signal,
      })
      if (!res.ok) return { ok: false, hasJwt: hasJwtForPayment() }
      const health = await res.json()
      return {
        ok: true,
        hasJwt: Boolean(health.hasJwt) || hasJwtForPayment(),
      }
    } catch {
      return { ok: false, hasJwt: hasJwtForPayment() }
    } finally {
      clearTimeout(timer)
    }
  }

  function markProxyOnline(origin, hasJwt) {
    activeProxyOrigin = origin.replace(/\/$/, '')
    useRelativeApi =
      useRelativePaymentApi() &&
      typeof location !== 'undefined' &&
      activeProxyOrigin === location.origin
    serverHasJwt = Boolean(hasJwt)
    global.DynaServer?.setOnline?.(true, serverHasJwt)
    if (global.DynaServer) global.DynaServer.hasJwt = serverHasJwt
  }

  async function discoverProxy() {
    applyConfigCredentials()

    if (!hasJwtForPayment() && getBakongEmail() && getRegisterCode()) {
      try {
        await renewJwtDirect()
      } catch (e) {
        console.warn('renewJwtDirect', e)
      }
    }

    const healthUrls = []
    if (useRelativePaymentApi() && isLocalDev() && !isLivePreviewHost()) {
      healthUrls.push(API_HEALTH)
    }
    for (const origin of proxyOriginsToTry()) {
      healthUrls.push(`${origin.replace(/\/$/, '')}${API_HEALTH}`)
    }

    for (const healthPath of [...new Set(healthUrls)]) {
      try {
        const res = await fetch(healthPath, { method: 'GET', mode: 'cors' })
        if (!res.ok) continue
        let hasJwt = hasJwtForPayment()
        try {
          const h = await res.json()
          hasJwt = Boolean(h.hasJwt || h.hasToken) || hasJwt
        } catch {
          /* ignore */
        }
        if (!hasJwt) await warmServerJwt()
        hasJwt = paymentJwtReady()
        const origin = healthPath.replace(/\/api\/health$/i, '')
        markProxyOnline(origin, hasJwt)
        try {
          localStorage.setItem(API_BASE_KEY, origin)
        } catch {
          /* ignore */
        }
        return true
      } catch {
        /* try next */
      }
    }

    if (hasJwtForPayment()) {
      markProxyOnline(paymentApiOrigin() || location.origin, true)
      return true
    }

    global.DynaServer?.setOnline?.(false, false)
    if (global.DynaServer) global.DynaServer.hasJwt = false
    return false
  }

  async function isProxyOnline() {
    return discoverProxy()
  }

  async function redirectToPaymentServerIfNeeded() {
    if (typeof location === 'undefined') return false
    if (location.protocol === 'file:') {
      global.showKhqrToast?.(paymentHelpMessage())
      return false
    }
    return true
  }

  async function renewBakongToken() {
    const email = getBakongEmail()
    if (!email) throw new Error('EMAIL_REQUIRED')

    const online = await isProxyOnline()
    if (!online) throw new Error('PROXY_OFFLINE')

    const cfg = configDefaults()
    const body = {
      email,
      organization: cfg.organization || 'Dyna Store',
      project: cfg.project || 'dyna_store',
    }
    const code = document.getElementById('bakongVerifyCode')?.value?.trim()
    if (code) body.code = code
    const rbk = getRegisterCode()
    if (rbk) body.token = rbk

    const res = await fetch(resolveProxyRenew(), {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.responseCode === 0 && json.data?.token) {
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = json.data.token
      saveSettings()
      return json.data.token
    }
    if (json.errorCode === 10) {
      throw new Error('NOT_REGISTERED')
    }
    throw new Error(json.responseMessage || 'RENEW_FAILED')
  }

  /** Ask Vercel/local server to obtain JWT (env token or renew). */
  async function warmServerJwt() {
    applyConfigCredentials()
    if (paymentJwtReady()) return true
    const email = getBakongEmail() || configDefaults().email
    if (!email) return hasJwtForPayment()

    try {
      const warmRes = await fetch(`${paymentApiOrigin() || ''}/api/warm-jwt`, {
        method: 'GET',
        mode: 'cors',
      })
      if (warmRes.ok) {
        const warm = await warmRes.json()
        if (warm.hasJwt) {
          serverHasJwt = true
          markProxyOnline(paymentApiOrigin() || location.origin, true)
          return true
        }
      }
    } catch {
      /* fall through */
    }

    const ok = await syncEmailToServer(true)
    if (ok) return true

    try {
      const cfg = configDefaults()
      const body = {
        email: email || cfg.email,
        organization: cfg.organization || 'Dyna Store',
        project: cfg.project || 'dyna_store',
        forceRenew: true,
      }
      const rbk = getRegisterCode()
      if (rbk) body.token = rbk
      const res = await fetch(resolveProxyRenew(), {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      const jwt = json.data?.token || json.token
      if (jwt?.startsWith('eyJ')) {
        localStorage.setItem(TOKEN_KEY, jwt)
        const tokenEl = document.getElementById('bakongToken')
        if (tokenEl) tokenEl.value = jwt
        serverHasJwt = true
        markProxyOnline(paymentApiOrigin() || location.origin, true)
        return true
      }
    } catch (e) {
      console.warn('warmServerJwt', e)
    }

    await discoverProxy()
    return serverHasJwt || hasJwtForPayment()
  }

  async function syncEmailToServer(force = false) {
    const email = getBakongEmail()
    if (!email) return false

    await isProxyOnline()
    if (!force && serverHasJwt) return true
    if (!force && Date.now() - lastEmailSyncAt < EMAIL_SYNC_COOLDOWN_MS) {
      return serverHasJwt
    }

    const cfg = configDefaults()
    try {
      const res = await fetch(resolveProxySetEmail(), {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          organization: cfg.organization || 'Dyna Store',
          project: cfg.project || 'dyna_store',
          forceRenew: Boolean(force),
          token: getRegisterCode() || undefined,
        }),
      })
      const json = await res.json()
      serverHasJwt = Boolean(json.hasJwt || json.hasToken)
      if (json.token?.startsWith('eyJ')) {
        localStorage.setItem(TOKEN_KEY, json.token)
        const tokenEl = document.getElementById('bakongToken')
        if (tokenEl) tokenEl.value = json.token
        serverHasJwt = true
      }
      lastEmailSyncAt = Date.now()
      if (serverHasJwt) {
        markProxyOnline(paymentApiOrigin() || location.origin, true)
      }
      return serverHasJwt
    } catch {
      return false
    }
  }

  function saveSettings() {
    const token = document.getElementById('bakongToken')?.value?.trim()
    const proxy = document.getElementById('bakongProxy')?.value?.trim()
    const account = document.getElementById('bakongAccount')?.value?.trim()
    const email =
      document.getElementById('bakongEmail')?.value?.trim() ||
      document.querySelector('.bakong-email-sync')?.value?.trim()
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    if (proxy) localStorage.setItem(PROXY_KEY, proxy)
    else localStorage.removeItem(PROXY_KEY)
    if (account) localStorage.setItem(ACCOUNT_KEY, account)
    else localStorage.removeItem(ACCOUNT_KEY)
    if (email) {
      localStorage.setItem(EMAIL_KEY, email)
      document.querySelectorAll('#bakongEmail, .bakong-email-sync').forEach((el) => {
        el.value = email
      })
    } else localStorage.removeItem(EMAIL_KEY)
  }

  function loadSettings() {
    applyConfigCredentials()
    const cfg = configDefaults()
    const tokenEl = document.getElementById('bakongToken')
    const proxyEl = document.getElementById('bakongProxy')
    const accountEl = document.getElementById('bakongAccount')
    const emailEl = document.getElementById('bakongEmail')
    if (tokenEl) {
      const jwt = cfg.token?.startsWith('eyJ') ? cfg.token : ''
      const rbk = getRegisterCode()
      const stored = localStorage.getItem(TOKEN_KEY) || ''
      tokenEl.value = (stored.startsWith('eyJ') ? stored : '') || jwt || rbk || ''
      if (jwt) localStorage.setItem(TOKEN_KEY, jwt)
    }
    if (proxyEl) {
      proxyEl.value = resolveProxyUrl() || API_CHECK_MD5
    }
    if (accountEl) {
      accountEl.value =
        localStorage.getItem(ACCOUNT_KEY) || cfg.account || MERCHANT.account
      if (cfg.account && !localStorage.getItem(ACCOUNT_KEY)) {
        localStorage.setItem(ACCOUNT_KEY, cfg.account)
      }
    }
    const storedEmail = localStorage.getItem(EMAIL_KEY) || cfg.email || ''
    document.querySelectorAll('#bakongEmail, .bakong-email-sync').forEach((el) => {
      el.value = storedEmail
    })
    if (storedEmail) localStorage.setItem(EMAIL_KEY, storedEmail)
  }

  function transactionLooksPaid(tx) {
    if (!tx || typeof tx !== 'object') return false
    if (tx.status === 'FAILED' || tx.status === 'FAIL') return false
    const st = String(tx.status || tx.transactionStatus || '').toUpperCase()
    if (st === 'NOT_FOUND' || st === 'PENDING') return false
    return (
      st === 'SUCCESS' ||
      st === 'PAID' ||
      st === 'COMPLETED' ||
      st === 'SUCCEEDED' ||
      st === 'ACCEPTED' ||
      st === 'SETTLED' ||
      Boolean(tx.hash) ||
      Boolean(tx.fromAccountId) ||
      Boolean(tx.toAccountId) ||
      Boolean(tx.receiverAccountId) ||
      Number(tx.acknowledgedDateMs) > 0 ||
      Number(tx.createdDateMs) > 0 ||
      Number(tx.transactionDate) > 0 ||
      (tx.amount != null && Number(tx.amount) > 0 && st !== 'PENDING')
    )
  }

  /** Map Bakong check_transaction_by_md5 response to status */
  function parsePaymentStatus(json) {
    if (!json || typeof json !== 'object') return 'pending'

    if (json._dyna?.paid === true) return 'paid'

    const msg = String(json.responseMessage || '')
    if (/invalid bakong response|invalid api response/i.test(msg)) {
      return json.errorCode === 6 ? 'unauthorized' : 'pending'
    }
    if (/HTTP 403|blocked cloud|BAKONG_RELAY/i.test(msg)) {
      return 'unauthorized'
    }

    if (json.errorCode === 6) return 'unauthorized'
    if (json.errorCode === 99) return 'no_token'
    if (json.errorCode === 1) return 'pending'
    if (json.errorCode === 2 || json.errorCode === 3) {
      if (/fail|reject|cancel|declin/i.test(msg)) return 'failed'
      return 'pending'
    }

    const d = json.data
    if (Array.isArray(d)) {
      if (d.some(transactionLooksPaid)) return 'paid'
    }

    const tx =
      d && typeof d === 'object' && d.transaction && typeof d.transaction === 'object'
        ? d.transaction
        : d

    if (json.responseCode === 0 && json.data != null) {
      if (Array.isArray(tx) && tx.some(transactionLooksPaid)) return 'paid'
      if (transactionLooksPaid(tx)) return 'paid'
      if (tx && typeof tx === 'object' && (tx.hash || tx.fromAccountId)) return 'paid'
      if (!tx || typeof tx !== 'object') {
        if (/success|completed|paid/i.test(String(json.responseMessage || ''))) return 'paid'
        return 'pending'
      }
      if (json.responseMessage && /success|completed|paid/i.test(String(json.responseMessage))) {
        return 'paid'
      }
    }

    if (json.responseCode === 1) return 'pending'
    return 'pending'
  }

  let currentPayload = ''
  let currentMd5 = ''
  let currentUsd = 0
  let pollTimer = null
  let pollStartedAt = 0
  let checking = false
  let lastPaymentCheckAt = 0
  let paymentCredited = false
  let serverHasJwt = false
  let lastEmailSyncAt = 0
  const EMAIL_SYNC_COOLDOWN_MS = 30 * 60 * 1000
  const creditedMd5 = new Set()
  loadCreditedMd5Set()

  function userFacingMessage(msg) {
    if (!msg) return msg
    const s = String(msg).toLowerCase()
    if (
      s.includes('email') ||
      s.includes('register') ||
      s.includes('renew_token') ||
      s.includes('proxy') ||
      s.includes('npm start') ||
      s.includes('server.mjs') ||
      s.includes('start server') ||
      s.includes('offline') ||
      s.includes('double-click')
    ) {
      return null
    }
    return msg
  }

  function formatCheckHint(json, err) {
    if (err) {
      const m = String(err.message || err)
      if (m.startsWith('PROXY_HTTP_')) {
        return `Payment API error (HTTP ${m.replace('PROXY_HTTP_', '')}) — check .env / Vercel env`
      }
      if (m === 'PROXY_BAD_RESPONSE') {
        return 'Payment API returned invalid data — run npm start or redeploy Vercel api/'
      }
      if (m === 'PROXY_OFFLINE') {
        return isVercelHost()
          ? 'Payment API offline — check /api/health on your Vercel URL'
          : 'Run npm start in the project folder, then open the URL it prints'
      }
      return userFacingMessage(m) || m
    }
    const msg = String(json?.responseMessage || json?.error || '').trim()
    if (/Server JWT missing/i.test(msg)) {
      return 'Set BAKONG_TOKEN in .env (eyJ…) or Vercel Environment Variables'
    }
    if (/not found/i.test(msg)) {
      return 'Bakong: payment not found yet — wait ~30s after paying, tap Check payment now'
    }
    if (/403|blocked|RELAY|cloud|invalid bakong/i.test(msg)) {
      return isVercelHost()
        ? 'Hosted: add BAKONG_TOKEN on Vercel + redeploy. If still fails, set BAKONG_RELAY_URL (ngrok → npm start)'
        : 'Bakong blocked — run npm start at http://127.0.0.1:8787'
    }
    return userFacingMessage(msg) || msg || null
  }

  async function readProxyJson(res) {
    const text = await res.text()
    if (!text.trim()) {
      return {
        responseCode: 1,
        errorCode: res.ok ? 1 : 99,
        responseMessage: res.ok ? 'Empty API response' : `HTTP ${res.status}`,
        data: null,
      }
    }
    try {
      return JSON.parse(text)
    } catch {
      const preview = text.replace(/\s+/g, ' ').slice(0, 120)
      return {
        responseCode: 1,
        errorCode: /403|forbidden/i.test(preview) ? 6 : 1,
        responseMessage: res.ok
          ? `Invalid API response: ${preview}`
          : `HTTP ${res.status}: ${preview}`,
        data: null,
      }
    }
  }

  function setPaymentStatus(status, detail) {
    const wrap = document.getElementById('khqrStatus')
    const text = document.getElementById('khqrStatusText')
    if (!wrap || !text) return

    wrap.className = 'khqr-status khqr-status--' + status
    const labels = {
      pending: 'Waiting for payment…',
      checking: 'Checking payment (MD5)…',
      paid: 'Payment received',
      failed: 'Payment failed',
      expired: 'QR expired — generate a new one',
      error: 'Could not reach Bakong API',
      demo: 'Demo mode — simulating payment check',
    }
    text.textContent = userFacingMessage(detail) || labels[status] || status
  }

  function updateMd5Display() {
    const el = document.getElementById('khqrMd5')
    if (!el) return
    el.textContent = currentMd5 || '—'
    el.title = currentMd5 ? `MD5: ${currentMd5}` : ''
    el.dataset.fullMd5 = currentMd5 || ''
  }

  async function checkTransactionByMd5(md5Hash) {
    const md5 = String(md5Hash || '').toLowerCase()
    const hist = getPaymentHistory().find((x) => x.md5 === md5)
    return requestPaymentCheck({
      md5,
      qr: hist?.qr || currentPayload || '',
      usd: Number(currentUsd) || usdForMd5(md5),
    })
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    checking = false
  }

  function creditWalletAfterPaid() {
    if (paymentCredited) return
    void confirmPayment()
  }

  function onPaymentPaid(data) {
    if (paymentCredited) return
    paymentCredited = true
    stopPolling()
    setPaymentStatus('paid', 'Payment received — updating balance…')
    applyTopupCredit(currentUsd, currentMd5, data)
    document.getElementById('khqrCheckNow')?.setAttribute('disabled', 'true')
    setTimeout(() => closeKhqrModal(), 1500)
  }

  async function ensurePaymentWatcher() {
    applyConfigCredentials()
    await discoverProxy()
    if (hasPaymentApi()) return true
    if (isStaticHosting()) {
      if (getRegisterCode()) await renewJwtDirect()
      return hasJwtForPayment()
    }
    if (!serverHasJwt && !hasJwtForPayment()) {
      await syncEmailToServer(true)
      await discoverProxy()
    }
    return hasPaymentApi() || serverHasJwt || hasJwtForPayment()
  }

  async function runPaymentCheck() {
    const now = Date.now()
    if (checking && now - lastPaymentCheckAt < 6000) return
    checking = true
    lastPaymentCheckAt = now
    setPaymentStatus('checking', 'Checking payment — balance updates automatically…')

    try {
      await discoverProxy()
      await warmServerJwt()

      if (await scanAllPendingPayments()) {
        setPaymentStatus('paid', 'Payment received — balance updated')
        stopPolling()
        setTimeout(() => closeKhqrModal(), 1500)
        return
      }

      if (!currentMd5) {
        setPaymentStatus('pending', 'Open Top Up and pay with the QR shown')
        return
      }
      if (!hasPaymentApi()) {
        await ensurePaymentWatcher()
      }
      if (!hasPaymentApi() && isBrowser()) {
        setPaymentStatus(
          'pending',
          isGitHubPages()
            ? 'Paste your Vercel URL in the banner above → Save → pay again'
            : isVercelHost()
              ? 'Add BAKONG_TOKEN in Vercel → Settings → Environment Variables → redeploy'
              : 'Run npm start, then open http://127.0.0.1:8787',
        )
        return
      }

      const hist = getPaymentHistory().find((x) => x.md5 === currentMd5)
      const qr = hist?.qr || currentPayload || ''
      const creditUsd = Number(currentUsd) || usdForMd5(currentMd5)

      let json = await requestPaymentCheck({
        md5: currentMd5,
        qr,
        usd: creditUsd,
        amount: creditUsd,
      })
      let status = isBakongPaid(json) ? 'paid' : parsePaymentStatus(json)
      let matchedMd5 = json?._dyna?.md5 || currentMd5

      if (status === 'no_token' || status === 'unauthorized') {
        await warmServerJwt()
        await renewJwtDirect()
        json = await requestPaymentCheck({ md5: currentMd5, qr, usd: creditUsd })
        status = isBakongPaid(json) ? 'paid' : parsePaymentStatus(json)
        matchedMd5 = json?._dyna?.md5 || currentMd5
      }

      if (isBakongPaid(json)) {
        applyTopupCredit(usdFromBakongData(json, creditUsd), matchedMd5, json?.data)
        setPaymentStatus('paid', 'Payment received — balance updated')
        stopPolling()
        setTimeout(() => closeKhqrModal(), 1500)
        return
      }
      if (status === 'no_token' || status === 'unauthorized') {
        const hint = String(json?.responseMessage || '')
        setPaymentStatus(
          'pending',
          /403|RELAY|cloud/i.test(hint)
            ? hint
            : isVercelHost()
              ? 'Paid? Wait ~30s, tap Check payment now — we verify from your browser (not Vercel server)'
              : 'Paid? Tap Check payment now — keep npm start running',
        )
        document.getElementById('khqrAdvanced')?.classList.remove('hidden')
        return
      }
      if (status === 'failed') {
        const failMsg = formatCheckHint(json, null)
        setPaymentStatus('failed', failMsg || 'Payment was declined or cancelled')
        stopPolling()
        return
      }
      if (status === 'error') {
        setPaymentStatus('pending', formatCheckHint(json, null) || 'Tap Check payment now to retry')
        return
      }
      const bakongMsg = String(json?.responseMessage || '').trim()
      const notFound = /not found|no transaction|does not exist/i.test(bakongMsg)
      if (notFound) {
        const elapsed = Math.round((Date.now() - pollStartedAt) / 1000)
        setPaymentStatus(
          'pending',
          elapsed < 120
            ? `Bakong: still syncing… (${elapsed}s) — keep this open after you paid`
            : 'Paid but not found? Generate a new QR, pay again, or paste MD5 below',
        )
      } else if (bakongMsg) {
        setPaymentStatus('checking', bakongMsg)
      } else {
        setPaymentStatus('pending', 'Waiting for payment… (auto-checking every 1s)')
      }
      saveLastCheck(matchedMd5, status, bakongMsg)
    } catch (err) {
      if (err.message === 'NO_TOKEN') {
        setPaymentStatus('pending', 'Waiting for payment…')
        return
      }
      if (err.message === 'UNAUTHORIZED') {
        setPaymentStatus('pending', 'Checking payment…')
        return
      }
      if (err.message === 'PROXY_OFFLINE') {
        setPaymentStatus(
          'pending',
          isGitHubPages()
            ? 'Link Vercel API URL in banner above, or run npm start locally'
            : isVercelHost()
              ? 'Vercel API missing — check /api/health and BAKONG_TOKEN env'
              : 'Run npm start (keep window open) then refresh',
        )
        return
      }
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setPaymentStatus(
          'pending',
          isGitHubPages()
            ? configApiBase()
              ? 'Cannot reach Vercel API — check URL and BAKONG_TOKEN on Vercel'
              : 'GitHub Pages: paste Vercel URL in banner → Save → Retry'
            : isVercelHost()
              ? 'Vercel API unreachable — redeploy with api/ folder + env vars'
              : 'Waiting for payment… (run npm start if testing locally)',
        )
        return
      }
      const hint = formatCheckHint(null, err)
      setPaymentStatus(
        'pending',
        hint || 'Could not verify yet — tap Check payment now (keep polling)',
      )
    } finally {
      checking = false
    }
  }

  async function startPolling() {
    stopPolling()
    pollStartedAt = Date.now()
    saveSettings()

    const proxy = resolveProxyUrl()
    paymentCredited = false

    document.getElementById('khqrCheckNow')?.removeAttribute('disabled')

    await discoverProxy()
    await ensurePaymentWatcher()
    setPaymentStatus('pending', 'Scan & pay — balance updates automatically')
    runPaymentCheck()
    pollTimer = setInterval(() => {
      if (Date.now() - pollStartedAt > PAYMENT_CHECK.maxPollMs) {
        setPaymentStatus('expired')
        stopPolling()
        return
      }
      runPaymentCheck()
    }, 1000)
  }

  function renderQr(container, payload) {
    if (!container) return
    container.innerHTML = ''
    if (!payload) {
      container.textContent = 'QR code could not be generated'
      return
    }
    if (typeof global.QRCode === 'undefined') {
      container.textContent = 'QR library missing — refresh the page'
      return
    }
    if (!verifyKhqr(payload)) {
      console.warn('KHQR verify failed, rendering anyway')
    }
    try {
      container.innerHTML = ''
      new global.QRCode(container, {
        text: payload,
        width: 240,
        height: 240,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: global.QRCode.CorrectLevel.H,
      })
    } catch (err) {
      console.error(err)
      container.textContent = 'Could not draw QR — try again'
    }
  }

  async function openKhqrModal(usdAmount) {
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) {
      global.showKhqrToast?.('Payment popup missing — refresh the page')
      return
    }

    saveSettings()
    loadSettings()

    const account = getBakongAccount()
    if (isInvalidAccount(account)) {
      global.showKhqrToast?.('Enter your Bakong ID above (e.g. ben_sothida@bkrt)')
      document.getElementById('bakongAccount')?.focus()
      return
    }

    overlay.classList.add('open')
    overlay.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
    document.body.classList.add('khqr-open')
    setPaymentStatus('pending', 'Generating QR…')

    try {
      currentUsd = Number(usdAmount)
      const built = await buildKhqr(usdAmount)
      currentPayload = built.qr
      currentMd5 = String(built.md5 || '').toLowerCase()
      if (!/^[a-f0-9]{32}$/.test(currentMd5)) {
        global.showKhqrToast?.('MD5 missing — reload page (check md5.min.js loads)')
        return
      }
    } catch (err) {
      console.error('buildKhqr', err)
      closeKhqrModal()
      global.showKhqrToast?.(
        err?.message === 'INVALID_ACCOUNT'
          ? 'Enter your Bakong ID above (e.g. ben_sothida@bkrt)'
          : 'Cannot build QR — run npm start and open http://127.0.0.1:8787',
      )
      return
    }

    document.getElementById('khqrAmountUsd').textContent = formatUsd(usdAmount)
    document.getElementById('khqrAmountKhr').textContent = formatKhr(usdAmount)
    document.getElementById('khqrMerchant').textContent = MERCHANT.name
    document.getElementById('khqrAccount').textContent = account

    const warn = document.getElementById('khqrAccountWarn')
    if (warn) warn.classList.add('hidden')

    const expireEl = document.getElementById('khqrExpire')
    if (expireEl) {
      const cur = MERCHANT.currency === '116' ? '៛' + Math.round(currentUsd * KHR_PER_USD).toLocaleString('en-US') : formatUsd(currentUsd)
      expireEl.textContent = `QR valid 10 min · ${cur} · account must match your Bakong registration`
    }

    updateMd5Display()
    savePendingTopup()

    renderQr(document.getElementById('khqrQr'), currentPayload)

    paymentCredited = false
    document.getElementById('khqrAdvanced')?.classList.toggle('hidden', serverHasJwt || Boolean(getToken()))
    setPaymentStatus('pending', 'Scan & pay — balance updates automatically')
    ensurePaymentReady().finally(() => {
      startPolling()
      void autoBalanceFromPending()
      void syncWalletAfterTopup()
    })
  }

  async function ensurePaymentReady() {
    const cfg = configDefaults()
    if (cfg.token?.startsWith('eyJ')) {
      localStorage.setItem(TOKEN_KEY, cfg.token)
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = cfg.token
      serverHasJwt = true
    }
    if (cfg.email) localStorage.setItem(EMAIL_KEY, cfg.email)

    await redirectToPaymentServerIfNeeded()

    const online = await discoverProxy()
    if (online && !serverHasJwt) {
      await warmServerJwt()
    }
    return online && (serverHasJwt || getToken().startsWith('eyJ'))
  }

  async function tryAutoRenewToken() {
    await ensurePaymentReady()
  }

  async function confirmPayment() {
    setPaymentStatus('checking', 'Verifying your payment with Bakong…')
    await warmServerJwt()
    await discoverProxy()
    if (await scanAllPendingPayments()) {
      setPaymentStatus('paid', 'Payment received — balance updated')
      stopPolling()
      setTimeout(() => closeKhqrModal(), 1500)
      return
    }
    if (!currentUsd || !currentMd5) return
    await runPaymentCheck()
    if (paymentCredited) return
    global.showKhqrToast?.(
      isVercelHost()
        ? 'Not confirmed yet — wait ~30s after paying, tap Check payment now again'
        : 'Not confirmed yet — keep npm start open, wait ~30s, tap Check payment now',
    )
    setPaymentStatus(
      'pending',
      formatCheckHint(null, null) ||
        'Still waiting for Bakong — tap Check payment now in ~30 seconds',
    )
  }

  async function fixBakongToken() {
    if (!getBakongEmail()) throw new Error('CONFIG_REQUIRED')
    return renewBakongToken()
  }

  function closeKhqrModal() {
    if (paymentCredited || !localStorage.getItem(PENDING_KEY)) {
      stopPolling()
    }
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) return
    overlay.classList.remove('open')
    overlay.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    document.body.classList.remove('khqr-open')
  }

  function initKhqrModal() {
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) return

    loadSettings()
    loadCreditedMd5Set()
    redirectToPaymentServerIfNeeded().then(() => ensurePaymentReady())
    void bootstrapPaymentWatcher()

    document.getElementById('khqrClose')?.addEventListener('click', closeKhqrModal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeKhqrModal()
    })

    document.getElementById('khqrCopy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentPayload)
        global.showKhqrToast?.('KHQR copied')
      } catch {
        global.showKhqrToast?.('Copy failed')
      }
    })

    document.getElementById('khqrCopyMd5')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentMd5)
        global.showKhqrToast?.('MD5 copied')
      } catch {
        global.showKhqrToast?.('Copy failed')
      }
    })

    document.getElementById('khqrCheckNow')?.addEventListener('click', () => {
      saveSettings()
      runPaymentCheck()
    })

    document.getElementById('bakongToken')?.addEventListener('change', saveSettings)
    document.getElementById('bakongProxy')?.addEventListener('change', saveSettings)
    document.getElementById('bakongAccount')?.addEventListener('change', saveSettings)
    document.getElementById('bakongEmail')?.addEventListener('change', saveSettings)

    document.getElementById('bakongToken')?.addEventListener('input', () => {
      if (currentMd5 && !paymentCredited) runPaymentCheck()
    })

    document.getElementById('khqrCreditPaid')?.addEventListener('click', () => {
      confirmPayment()
    })

    document.getElementById('bakongFixToken')?.addEventListener('click', async () => {
      const btn = document.getElementById('bakongFixToken')
      const statusEl = document.getElementById('bakongRenewStatus')
      if (btn) btn.disabled = true
      if (statusEl) statusEl.textContent = 'Getting JWT…'
      try {
        saveSettings()
        await fixBakongToken()
        serverHasJwt = true
        if (statusEl) statusEl.textContent = 'JWT saved — MD5 check enabled'
        document.getElementById('khqrAdvanced')?.classList.add('hidden')
        if (pollTimer) stopPolling()
        startPolling()
        global.showKhqrToast?.('API token fixed')
        if (currentMd5) runPaymentCheck()
      } catch (err) {
        const msg =
          err.message === 'CONFIG_REQUIRED' || err.message === 'NOT_REGISTERED'
            ? 'Could not connect payment check — try again'
            : userFacingMessage(err.message) || 'Could not get token'
        if (statusEl) statusEl.textContent = msg
        if (msg) global.showKhqrToast?.(msg)
      } finally {
        if (btn) btn.disabled = false
      }
    })

    document.getElementById('bakongRenewToken')?.addEventListener('click', async () => {
      const btn = document.getElementById('bakongRenewToken')
      const statusEl = document.getElementById('bakongRenewStatus')
      if (btn) btn.disabled = true
      if (statusEl) statusEl.textContent = 'Requesting token…'
      try {
        saveSettings()
        await renewBakongToken()
        serverHasJwt = true
        if (statusEl) statusEl.textContent = 'New token saved — payment check enabled'
        document.getElementById('khqrAdvanced')?.classList.add('hidden')
        global.showKhqrToast?.('Bakong API token renewed')
        if (currentMd5) {
          setPaymentStatus('pending', 'Checking payment…')
          runPaymentCheck()
          if (!pollTimer) startPolling()
        }
      } catch (err) {
        const msg =
          err.message === 'EMAIL_REQUIRED' || err.message === 'NOT_REGISTERED'
            ? 'Could not connect payment check — try again'
            : err.message === 'PROXY_OFFLINE'
              ? 'Could not connect payment check — try again'
              : userFacingMessage(err.message) || 'Could not renew token'
        if (statusEl) statusEl.textContent = msg
        if (msg) global.showKhqrToast?.(msg)
      } finally {
        if (btn) btn.disabled = false
      }
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeKhqrModal()
    })
  }

  function serverStatusHtml(strong, extra) {
    return `<strong>${strong}</strong>${extra || ''} <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>`
  }

  global.DynaServer = {
    online: false,
    hasJwt: false,
    setOnline(ok, hasJwt) {
      this.online = Boolean(ok)
      if (hasJwt !== undefined) this.hasJwt = Boolean(hasJwt)
      const el = document.getElementById('serverStatus')
      if (!el) return
      const apiBase = configApiBase()
      const hosted = isStaticHosting()

      const jwtReady = paymentJwtReady()
      const canCheck = hasPaymentApi() && (this.online || jwtReady)
      const hideBanner = jwtReady && canCheck
      el.classList.toggle('hidden', hideBanner)
      el.classList.toggle('server-status--offline', !this.online || !jwtReady)
      el.classList.toggle('server-status--ok', this.online && jwtReady)

      if (this.online && jwtReady) {
        const where = isGitHubPages()
          ? configApiBase()
          : typeof location !== 'undefined'
            ? location.origin + '/api/check-md5'
            : '/api/check-md5'
        el.innerHTML =
          `<strong>Payment check ready.</strong> API: <code>${where}</code> — balance updates after you pay.`
        return
      }

      if (hosted) {
        if (this.online && this.hasJwt) {
          el.innerHTML =
            '<strong>Payment check ready.</strong> Scan QR — balance updates after you pay.'
        } else if (!apiBase) {
          el.innerHTML =
            '<div class="server-setup"><strong>GitHub Pages cannot check Bakong alone</strong><p>Option A: run <code>npm start</code> locally</p><p>Option B: deploy to <a href="https://vercel.com" target="_blank" rel="noopener">Vercel</a> and paste URL:</p><input type="url" id="apiBaseInput" class="server-setup-input" placeholder="https://your-app.vercel.app" /><button type="button" class="server-retry-btn" id="serverSaveApi">Save</button> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button></div>'
        } else if (!this.online) {
          el.innerHTML =
            '<strong>Payment server not reachable.</strong> Check URL or run <code>npm start</code>. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
        } else {
          el.innerHTML =
            isVercelHost()
              ? '<strong>API online but no JWT.</strong> In Vercel → Settings → Environment Variables add all three: <code>BAKONG_TOKEN</code>, <code>BAKONG_EMAIL</code>, <code>BAKONG_REGISTER_TOKEN</code> → Save → Redeploy. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
              : '<strong>API online but no JWT.</strong> Copy <code>.env.example</code> to <code>.env</code>, fill <code>BAKONG_TOKEN</code> + email, restart <code>npm start</code>. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
        }
        return
      }

      if (!this.online) {
        el.innerHTML =
          '<strong>Payment server offline.</strong> Run <code>npm start</code> and keep the window open. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
        return
      }
      el.innerHTML =
        '<strong>API online but no JWT.</strong> Fix <code>.env</code>: <code>BAKONG_TOKEN</code>=<code>eyJ...</code> and <code>BAKONG_REGISTER_TOKEN</code>=<code>rbk...</code> (do not swap). Restart <code>npm start</code>. <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
    },
    async ping() {
      try {
        applyConfigCredentials()
        await warmServerJwt()
        const ok = await discoverProxy()
        const ready = paymentJwtReady()
        this.setOnline(ok || ready, ready)
        if (ready) global.DYNA_PAYMENT_API_READY = true
        return ready
      } catch {
        this.setOnline(false, false)
        return false
      }
    },
  }

  async function autoBalanceFromPending() {
    applyConfigCredentials()
    const hasPending =
      Boolean(localStorage.getItem(PENDING_KEY)) || getPaymentHistory().length > 0
    if (!hasPending) return false
    await warmServerJwt()
    if (!paymentJwtReady()) {
      try {
        await renewJwtDirect()
      } catch {
        /* ignore */
      }
    }
    if (!hasPaymentApi() && !global.DynaPaymentApiBase?.resolve?.()) return false

    const ok = await resumePendingTopup()
    if (ok || paymentCredited) return true

    for (const item of getPaymentHistory().slice().reverse()) {
      if (creditedMd5.has(item.md5)) continue
      const credited = await checkMd5AndCredit(item.md5, item.usd)
      if (credited) return true
    }

    if (currentMd5 && !paymentCredited) {
      await runPaymentCheck()
    }
    return paymentCredited
  }

  async function bootstrapPaymentWatcher() {
    applyConfigCredentials()
    await warmServerJwt()
    await discoverProxy()
    global.DynaServer?.ping?.()
    updatePendingBanner(Boolean(localStorage.getItem(PENDING_KEY)))
    await autoBalanceFromPending()
    if (!global.__dynaPaymentInterval) {
      global.__dynaPaymentInterval = setInterval(() => void autoBalanceFromPending(), 800)
    }
    if (!global.__dynaVisibilitySync) {
      global.__dynaVisibilitySync = true
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void autoBalanceFromPending()
          if (currentMd5 && !paymentCredited) void runPaymentCheck()
        }
      })
    }
  }

  async function syncWalletAfterTopup() {
    applyConfigCredentials()
    await warmServerJwt()
    return (await scanAllPendingPayments()) || (await autoBalanceFromPending())
  }

  global.Khqr = {
    buildKhqr,
    verifyKhqr,
    isInvalidAccount,
    isProxyOnline,
    discoverProxy,
    warmServerJwt,
    redirectToPaymentServerIfNeeded,
    checkServerOnline: isProxyOnline,
    hashMd5,
    checkTransactionByMd5,
    renewBakongToken,
    fixBakongToken,
    tryAutoRenewToken,
    ensurePaymentReady,
    syncEmailToServer,
    confirmPayment,
    applyTopupCredit,
    resumePendingTopup,
    checkMd5AndCredit,
    checkByBakongHash,
    scanAllPendingPayments,
    checkAllPaymentHistory,
    addPaymentHistory,
    getPaymentHistory,
    usdForMd5,
    bootstrapPaymentWatcher,
    autoBalanceFromPending,
    syncWalletAfterTopup,
    checkPaymentNow: () => runPaymentCheck(),
    buildKhqrLocal,
    hasPaymentApi,
    creditWalletAfterPaid,
    parsePaymentStatus,
    openKhqrModal,
    closeKhqrModal,
    initKhqrModal,
    loadSettings,
    applyConfigCredentials,
    configDefaults,
    paymentHelpMessage,
    configuredSiteUrl,
    hasJwtForPayment,
    saveSettings,
    formatKhr,
    formatUsd,
    KHR_PER_USD,
    MERCHANT,
    PAYMENT_CHECK,
    onPaymentSuccess: null,
  }
})(typeof window !== 'undefined' ? window : global)
