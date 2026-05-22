/**
 * Fix swapped BAKONG_TOKEN (must be eyJ) and BAKONG_REGISTER_TOKEN (must be rbk).
 */
export function fixSwappedBakongEnv(env = process.env) {
  const token = String(env.BAKONG_TOKEN || '').trim()
  const register = String(env.BAKONG_REGISTER_TOKEN || '').trim()
  if (token.startsWith('rbk') && register.startsWith('eyJ')) {
    env.BAKONG_TOKEN = register
    env.BAKONG_REGISTER_TOKEN = token
    return true
  }
  return false
}

export function validateBakongEnv(env = process.env) {
  fixSwappedBakongEnv(env)
  const errors = []
  const token = String(env.BAKONG_TOKEN || '').trim()
  const register = String(env.BAKONG_REGISTER_TOKEN || '').trim()
  const email = String(env.BAKONG_EMAIL || '').trim()

  if (token.startsWith('rbk')) {
    errors.push('BAKONG_TOKEN must be JWT (eyJ...), not rbk — swap lines in .env')
  }
  if (register.startsWith('eyJ')) {
    errors.push('BAKONG_REGISTER_TOKEN must be rbk..., not JWT — swap lines in .env')
  }
  if (!token.startsWith('eyJ') && !(email && register.startsWith('rbk'))) {
    errors.push('Set BAKONG_TOKEN=eyJ... or BAKONG_EMAIL + BAKONG_REGISTER_TOKEN in .env')
  }
  return errors
}
