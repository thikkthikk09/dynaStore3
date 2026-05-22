import crypto from 'crypto'

function md5hex(text) {
  return crypto.createHash('md5').update(String(text), 'utf8').digest('hex').toLowerCase()
}

function addCandidate(out, value) {
  const x = String(value || '').toLowerCase()
  if (/^[a-f0-9]{32}$/.test(x) && !out.includes(x)) out.push(x)
  const upper = x.toUpperCase()
  if (/^[A-F0-9]{32}$/.test(upper) && !out.includes(upper)) out.push(upper)
}

/**
 * Bakong may index MD5 of the full KHQR, payload without CRC, or case variants.
 */
export function collectMd5Candidates(md5, qr) {
  const out = []
  addCandidate(out, md5)

  const q = String(qr || '').trim()
  if (!q) return out

  addCandidate(out, md5hex(q))
  if (q.toUpperCase() !== q) addCandidate(out, md5hex(q.toUpperCase()))
  if (q.toLowerCase() !== q) addCandidate(out, md5hex(q.toLowerCase()))

  if (q.length > 4) addCandidate(out, md5hex(q.slice(0, -4)))

  const crcTag = q.lastIndexOf('6304')
  if (crcTag > 0) {
    addCandidate(out, md5hex(q.slice(0, crcTag)))
    if (q.length >= crcTag + 8) addCandidate(out, md5hex(q.slice(0, crcTag + 8)))
  }

  if (q.length > 8) addCandidate(out, md5hex(q.slice(0, -8)))

  return out
}
