/**
 * Public site + payment API (same host on Vercel).
 * Live Preview (:3000) and GitHub Pages use this — never port 3000 for /api.
 * Secrets: bakong.config.local.js (local) or Vercel env (production).
 */
window.DYNA_BAKONG_CONFIG = {
  publicSiteUrl: 'https://dyna-store3.vercel.app',
  apiBase: 'https://dyna-store3.vercel.app',
  paymentCheckUrl: 'https://dyna-store3.vercel.app/api/check-md5',
  healthUrl: 'https://dyna-store3.vercel.app/api/health',
  proxy: '',
  account: 'ben_sothida@bkrt',
  organization: 'Dyna Store',
  project: 'dyna_store',
  email: 'thikkthikk09@gmail.com',
  /** Register code from bakong.nbc.gov.kh — renews JWT (NOT for MD5 check). */
  registerToken: 'rbk82qAU7sFjn7CG2mAP-CA0_mKVz_RNVRcNlA60b3oNkY',
  /** JWT (eyJ…) — prefer bakong.config.local.js or Vercel BAKONG_TOKEN (do not commit JWT to git) */
  token: '',
}
