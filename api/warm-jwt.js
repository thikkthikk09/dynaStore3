import { cors, ensureServerJwtAvailable, sendJson } from './bakong-lib.mjs'

/** GET/POST /api/warm-jwt — obtain JWT for payment checks (used by Retry button). */
export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  const jwt = await ensureServerJwtAvailable()
  const hasJwt = jwt.startsWith('eyJ')
  const missing = []
  if (!hasJwt) {
    if (!process.env.BAKONG_TOKEN?.startsWith('eyJ')) missing.push('BAKONG_TOKEN')
    if (!process.env.BAKONG_EMAIL) missing.push('BAKONG_EMAIL')
    if (!String(process.env.BAKONG_REGISTER_TOKEN || '').startsWith('rbk')) {
      missing.push('BAKONG_REGISTER_TOKEN')
    }
  }

  return sendJson(res, 200, {
    ok: hasJwt,
    hasJwt,
    hasToken: hasJwt,
    missingEnv: missing.length ? missing : undefined,
    hint: hasJwt
      ? null
      : 'Set BAKONG_TOKEN on Vercel (or BAKONG_EMAIL + BAKONG_REGISTER_TOKEN), then redeploy',
  })
}
