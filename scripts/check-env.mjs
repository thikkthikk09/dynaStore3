import path from 'path'
import { fileURLToPath } from 'url'
import { loadDotenv } from './load-dotenv.mjs'
import { fixSwappedBakongEnv, validateBakongEnv } from './fix-bakong-env.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const hasEnv = loadDotenv(root)

if (!hasEnv) {
  console.error('')
  console.error('  Missing .env file')
  console.error('  Copy .env.example to .env and fill BAKONG_TOKEN (eyJ), BAKONG_EMAIL, BAKONG_REGISTER_TOKEN (rbk)')
  console.error('')
  process.exit(1)
}

if (fixSwappedBakongEnv()) {
  console.log('  Fixed swapped BAKONG_TOKEN / BAKONG_REGISTER_TOKEN in memory')
}

const errors = validateBakongEnv()
if (errors.length) {
  console.error('')
  console.error('  .env configuration problems:')
  errors.forEach((e) => console.error('   -', e))
  console.error('')
  process.exit(1)
}

console.log('  .env OK — Bakong credentials look valid')
