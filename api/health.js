import { callCheckMd5, cors, ensureServerJwtAvailable, sendJson } from './bakong-lib.mjs'
import { paymentFunctionConfig } from './payment-handler.mjs'

export const config = paymentFunctionConfig

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })

  const jwt = await ensureServerJwtAvailable()
  const hasJwt = jwt.startsWith('eyJ')
  const site =
    process.env.DYNA_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  const relay = String(process.env.BAKONG_RELAY_URL || '').trim()

  let bakongReachable = false
  let bakongBlocked = false
  if (hasJwt) {
    const probe = await callCheckMd5('00000000000000000000000000000000', jwt)
    bakongBlocked = probe._bakongHttp === 403 || /blocked cloud|HTTP 403/i.test(String(probe.responseMessage))
    bakongReachable =
      !bakongBlocked &&
      (probe.responseCode !== undefined || /not found/i.test(String(probe.responseMessage)))
  }

  let hint = null
  if (!hasJwt) {
    hint = 'Vercel → Settings → Environment Variables → add BAKONG_TOKEN (eyJ…) + BAKONG_EMAIL → Redeploy'
  } else if (bakongBlocked && !relay) {
    hint =
      'Bakong blocks Vercel IPs. Run npm start, expose with ngrok, set BAKONG_RELAY_URL=https://YOUR-NGROK/api parent → Redeploy'
  } else if (bakongBlocked && relay) {
    hint = 'Using BAKONG_RELAY_URL — ensure your PC/npm start is running'
  }

  return sendJson(res, 200, {
    ok: hasJwt && (bakongReachable || Boolean(relay)),
    hasToken: hasJwt,
    hasJwt,
    email: process.env.BAKONG_EMAIL || null,
    hosted: true,
    runtime: 'vercel-serverless',
    siteUrl: site,
    bakongReachable,
    bakongBlocked,
    hasRelay: Boolean(relay),
    paymentRoutes: {
      checkMd5: '/api/check-md5',
      envConfig: '/api/env-config',
      webhook: '/api/webhook',
    },
    hint,
  })
}
