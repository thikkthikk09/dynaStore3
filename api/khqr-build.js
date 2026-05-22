import { generateKhqrIndividual } from './khqr-generate.mjs'

export const config = { maxDuration: 10 }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}')
    const usd = Number(body.usd ?? body.amount ?? 0.01)
    const currency = body.currency === '116' ? '116' : '840'
    const amount = currency === '116' ? Math.round(usd * 4100) : Number(usd.toFixed(2))
    const built = generateKhqrIndividual({
      bakongAccountID: body.account || process.env.BAKONG_ACCOUNT || '',
      merchantName: body.merchantName || process.env.BAKONG_ORG || 'Dyna Store',
      merchantCity: body.merchantCity || 'Phnom Penh',
      amount,
      currency,
    })
    return res.status(200).json({ ok: true, ...built })
  } catch (err) {
    return res.status(400).json({ error: String(err.message) })
  }
}
