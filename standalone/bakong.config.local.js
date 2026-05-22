/**
 * Local overrides (gitignored).
 *
 * YOU WROTE THEM BACKWARDS IN CHAT — USE THIS MAPPING:
 *   token         = JWT  (starts with eyJ) — for MD5 payment check
 *   registerToken = rbk  (starts with rbk) — only to renew JWT
 */
window.DYNA_BAKONG_CONFIG = {
  ...(window.DYNA_BAKONG_CONFIG || {}),
  /* apiBase: set at runtime in boot.js — preview/Vercel → public URL, port 8787 → local */
  proxy: '',
  account: 'ben_sothida@bkrt',
  organization: 'Dyna Store',
  project: 'dyna_store',
  email: 'thikkthikk09@gmail.com',  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiMWJkOTRjMDY2ODViNGIwMiJ9LCJpYXQiOjE3Nzk0NzYxNjAsImV4cCI6MTc4NzI1MjE2MH0.8cv2PDCvqHMCXmE0lMfInAtuBzfIts1QVEiD11RX1X0',
  registerToken: 'rbk82qAU7sFjn7CG2mAP-CA0_mKVz_RNVRcNlA60b3oNkY',
}
