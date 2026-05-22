/**
 * Quick MD5 check smoke test (needs npm start or .env BAKONG_TOKEN).
 * Usage: node scripts/verify-md5-check.mjs [md5]
 */
import crypto from 'crypto'
import { loadDotenv } from './load-dotenv.mjs'
import { collectMd5Candidates } from '../api/md5-variants.mjs'

loadDotenv(process.cwd())

const md5 = (process.argv[2] || '00000000000000000000000000000000').toLowerCase()
const base = process.env.DYNA_SITE_URL || 'http://127.0.0.1:8787'
const token = process.env.BAKONG_TOKEN || ''

const health = await fetch(`${base}/api/health`).then((r) => r.json())
console.log('health', health)

const qr = process.argv[3] || ''
const body = {
  md5,
  qr: qr || undefined,
  md5List: collectMd5Candidates(md5, qr).slice(0, 12),
  token: token.startsWith('eyJ') ? token : undefined,
}

const t0 = Date.now()
const res = await fetch(`${base}/api/check-md5`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const json = await res.json()
console.log(`check-md5 (${Date.now() - t0}ms):`, json.responseMessage || json.error)
console.log('paid:', json._dyna?.paid, 'md5:', json._dyna?.md5)
