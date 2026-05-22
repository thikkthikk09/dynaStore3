/**
 * Create .env from .env.example, fix swapped tokens, renew JWT if needed.
 * Usage: node scripts/setup-env.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadDotenv } from './load-dotenv.mjs'
import { fixSwappedBakongEnv, validateBakongEnv } from './fix-bakong-env.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const envPath = path.join(root, '.env')
const examplePath = path.join(root, '.env.example')

if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
  fs.copyFileSync(examplePath, envPath)
  console.log('  Created .env from .env.example')
}

loadDotenv(root)
if (fixSwappedBakongEnv()) {
  console.log('  Fixed swapped BAKONG_TOKEN / BAKONG_REGISTER_TOKEN')
}

let token = String(process.env.BAKONG_TOKEN || '').trim()
const email = String(process.env.BAKONG_EMAIL || '').trim()
const rbk = String(process.env.BAKONG_REGISTER_TOKEN || '').trim()

if (!token.startsWith('eyJ') && email && rbk.startsWith('rbk')) {
  console.log('  Renewing Bakong JWT…')
  const res = await fetch('https://api-bakong.nbc.gov.kh/v1/renew_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      token: rbk,
      organization: process.env.BAKONG_ORG || 'Dyna Store',
      project: process.env.BAKONG_PROJECT || 'dyna_store',
    }),
  })
  const json = await res.json()
  if (json.responseCode === 0 && json.data?.token?.startsWith('eyJ')) {
    token = json.data.token
    process.env.BAKONG_TOKEN = token
    console.log('  Got new JWT — saving to .env')
  } else {
    console.warn('  Renew failed:', json.responseMessage || 'unknown')
  }
}

function writeEnv() {
  const lines = [
    '# Dyna Store — auto-maintained by scripts/setup-env.mjs',
    `DYNA_SITE_URL=${process.env.DYNA_SITE_URL || 'http://127.0.0.1:8787'}`,
    `BAKONG_TOKEN=${process.env.BAKONG_TOKEN || ''}`,
    `BAKONG_EMAIL=${process.env.BAKONG_EMAIL || ''}`,
    `BAKONG_REGISTER_TOKEN=${process.env.BAKONG_REGISTER_TOKEN || ''}`,
    `BAKONG_ACCOUNT=${process.env.BAKONG_ACCOUNT || 'ben_sothida@bkrt'}`,
    `BAKONG_ORG=${process.env.BAKONG_ORG || 'Dyna Store'}`,
    `BAKONG_PROJECT=${process.env.BAKONG_PROJECT || 'dyna_store'}`,
    '',
  ]
  fs.writeFileSync(envPath, lines.join('\n'), 'utf8')
}

if (token.startsWith('eyJ')) writeEnv()

const errors = validateBakongEnv()
if (errors.length) {
  console.error('')
  errors.forEach((e) => console.error('  !', e))
  console.error('')
  process.exit(1)
}

console.log('  .env ready — payment API can run')
