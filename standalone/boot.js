/**
 * Load Dyna Store assets with correct paths (Cursor preview, file://, Vercel, npm start).
 */
;(function () {
  let root = String(window.DYNA_ASSET_ROOT || '').trim()
  const script = document.currentScript
  if (!root && script?.src) {
    if (script.src.includes('/standalone/')) {
      root = script.src.replace(/standalone\/[^/]*$/, '')
    } else {
      root = script.src.replace(/\/[^/]*$/, '/')
    }
  }
  if (!root || root === location.origin + '/') {
    const href = location.href.split(/[?#]/)[0]
    const slash = href.lastIndexOf('/')
    root = slash >= 0 ? href.slice(0, slash + 1) : location.origin + '/'
  }

  function asset(path) {
    return root + path.replace(/^\//, '')
  }

  const critical = document.createElement('style')
  critical.textContent = `
    html, body { margin: 0; min-height: 100%; background: #0a0b0f; color: #f4f4f6; }
    .app { min-height: 100vh; display: flex; flex-direction: column; visibility: visible !important; opacity: 1 !important; }
    .boot-msg { padding: 1.5rem; text-align: center; color: #8b8f9e; }
  `
  document.head.appendChild(critical)

  const css = document.createElement('link')
  css.rel = 'stylesheet'
  css.href = asset('standalone/styles.css')
  document.head.appendChild(css)

  const scripts = [
    'api/env-config',
    'standalone/md5.min.js',
    'standalone/qrcode.min.js',
    'standalone/bakong-khqr-lite.js',
    'standalone/bakong.config.js',
    'standalone/bakong.config.local.js',
    'standalone/payment-api-base.js',
    'standalone/khqr.js',
    'standalone/game-upload.js',
    'standalone/app.js',
    'standalone/payment-status.js',
  ]

  function syncApiBaseForHost() {
    const cfg = window.DYNA_BAKONG_CONFIG || {}
    const pub = String(cfg.publicSiteUrl || cfg.apiBase || 'https://dyna-store3.vercel.app').replace(
      /\/$/,
      '',
    )
    const port = typeof location !== 'undefined' ? location.port : ''
    const apiBase = port === '8787' ? 'http://127.0.0.1:8787' : pub
    window.DYNA_BAKONG_CONFIG = {
      ...cfg,
      publicSiteUrl: pub,
      apiBase,
      paymentCheckUrl: `${apiBase}/api/check-md5`,
      healthUrl: `${apiBase}/api/health`,
    }
    try {
      localStorage.setItem('dyna_api_base', apiBase)
    } catch (_) {}
  }

  function finishBoot() {
    window.DYNA_BOOT_READY = true
    syncApiBaseForHost()
    window.DynaPaymentApiBase?.apply?.()
    try {
      window.dispatchEvent(new Event('dyna-boot-ready'))
    } catch (_) {}
    const msg = document.getElementById('bootMsg')
    if (msg && !window.DynaWallet) {
      msg.textContent = 'Starting store…'
    }
    if (typeof window.startDynaApp === 'function') {
      window.startDynaApp()
    }
    if (window.DynaPaymentStatus?.checkNow) {
      void window.DynaPaymentStatus.checkNow()
    }
  }

  function loadScript(i) {
    if (i >= scripts.length) {
      finishBoot()
      return
    }
    const s = document.createElement('script')
    if (scripts[i].startsWith('api/')) {
      const pub = 'https://dyna-store3.vercel.app'
      const usePublicApi =
        window.DYNA_LIVE_PREVIEW ||
        location.port === '3000' ||
        location.port === '5500' ||
        location.port === '5173'
      s.src = usePublicApi ? `${pub}/${scripts[i]}` : `/${scripts[i]}`
    } else {
      s.src = asset(scripts[i])
    }
    s.async = false
    s.onload = function () {
      loadScript(i + 1)
    }
    s.onerror = function () {
      if (scripts[i].includes('bakong.config') || scripts[i].includes('env-config')) {
        window.DYNA_BAKONG_CONFIG = window.DYNA_BAKONG_CONFIG || {}
        window.DYNA_RUNTIME_CONFIG = window.DYNA_RUNTIME_CONFIG || {}
        loadScript(i + 1)
        return
      }
      console.error('Failed to load', scripts[i])
      loadScript(i + 1)
    }
    document.body.appendChild(s)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadScript(0)
    })
  } else {
    loadScript(0)
  }

  window.DYNA_ASSET_ROOT = root
})()
