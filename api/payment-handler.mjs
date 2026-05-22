import {

  callCheckMd5,

  callCheckByHash,

  cors,

  ensureServerJwtAvailable,

  readJsonBody,

  paidAmountFromBakong,

  sendJson,

  transactionPaid,

} from './bakong-lib.mjs'

import { collectMd5Candidates } from './md5-variants.mjs'



export const paymentFunctionConfig = {

  maxDuration: 15,

  regions: ['sin1', 'hkg1', 'hnd1', 'bom1'],

}



function extractMd5(source) {

  const raw = String(

    source?.md5 || source?.MD5 || source?.transactionMd5 || source?.payment_md5 || '',

  )

    .trim()

    .toLowerCase()

  if (/^[a-f0-9]{32}$/.test(raw)) return raw

  return ''

}



function extractBakongHash(source) {

  const raw = String(

    source?.bakongHash ||

      source?.transactionHash ||

      source?.hash ||

      source?.receiptHash ||

      '',

  )

    .trim()

    .toLowerCase()

  if (raw.length >= 8 && /^[a-f0-9]+$/.test(raw)) return raw

  return ''

}



function extractAmount(source) {

  const n = Number(source?.amount ?? source?.usd ?? source?.transactionAmount)

  return Number.isFinite(n) && n > 0 ? n : null

}



async function checkOneMd5(candidate, token, clientToken) {
  let attempt = await callCheckMd5(candidate, token)
  if (attempt.errorCode === 6 && !attempt._bakongHttp) {
    const fresh = await ensureServerJwtAvailable(clientToken)
    if (fresh.startsWith('eyJ') && fresh !== token) {
      attempt = await callCheckMd5(candidate, fresh)
    }
  }
  return attempt
}

async function tryCheckMd5Candidates(candidates, token, clientToken) {
  const list = [...new Set(candidates)].slice(0, 12)
  let last = null
  let matchedMd5 = list[0] || ''
  const chunkSize = 4

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize)
    const attempts = await Promise.all(
      chunk.map(async (candidate) => ({
        candidate,
        attempt: await checkOneMd5(candidate, token, clientToken),
      })),
    )
    for (const { candidate, attempt } of attempts) {
      last = attempt
      if (transactionPaid(attempt)) {
        return { paid: true, data: attempt, matchedMd5: candidate, method: 'md5' }
      }
    }
  }

  return { paid: false, data: last, matchedMd5, method: 'md5' }
}



/**

 * POST body: { md5, qr?, bakongHash?, token?, amount?, usd? }

 * md5 = 32-char hash of KHQR string (shown in QR modal). bakongHash = receipt hash # (optional).

 */

export async function handlePaymentVerify(req, res, { allowGet = false } = {}) {

  cors(res)



  if (req.method === 'OPTIONS') {

    return res.status(204).end()

  }



  let payload = {}

  if (req.method === 'POST') {

    payload = await readJsonBody(req)

  } else if (allowGet && req.method === 'GET') {

    payload = { ...(req.query || {}) }

  } else {

    return sendJson(res, 405, {

      error: 'Method not allowed',

      allowed: allowGet ? ['GET', 'POST', 'OPTIONS'] : ['POST', 'OPTIONS'],

    })

  }



  const md5 = extractMd5(payload)

  const bakongHash = extractBakongHash(payload)

  const qr = String(payload?.qr || payload?.QR || payload?.payload || '').trim()



  if (!md5 && !bakongHash) {

    return sendJson(res, 400, {

      error: 'md5 (32 hex) or bakongHash required',

      example: {

        md5: 'abc123...',

        qr: 'KHQR string from QR screen',

        bakongHash: 'optional receipt hash',

        token: 'optional eyJ...',

      },

    })

  }



  const token = await ensureServerJwtAvailable(payload?.token || payload?.bearer)

  if (!token.startsWith('eyJ')) {

    return sendJson(res, 200, {

      responseCode: 1,

      responseMessage:

        'Server JWT missing — set BAKONG_TOKEN on Vercel or send token (eyJ) in request body',

      errorCode: 99,

      data: null,

      _dyna: { paid: false, md5: md5 || null, hasJwt: false, hosted: true },

    })

  }



  try {

    let result = { paid: false, data: null, matchedMd5: md5, method: 'none' }



    if (md5) {
      const fromClient = Array.isArray(payload?.md5List)
        ? payload.md5List.map((x) => String(x || '').toLowerCase()).filter((x) => /^[a-f0-9]{32}$/.test(x))
        : []
      const candidates = [...fromClient, ...collectMd5Candidates(md5, qr)]
      result = await tryCheckMd5Candidates(candidates, token, payload?.token)
    }



    if (!result.paid && bakongHash) {

      let attempt = await callCheckByHash(bakongHash, token)

      if (attempt.errorCode === 6 && !attempt._bakongHttp) {

        const fresh = await ensureServerJwtAvailable(payload?.token)

        if (fresh.startsWith('eyJ')) attempt = await callCheckByHash(bakongHash, fresh)

      }

      if (transactionPaid(attempt)) {

        result = { paid: true, data: attempt, matchedMd5: md5 || bakongHash, method: 'hash' }

      } else if (!result.data) {

        result.data = attempt

      }

    }



    const paid = result.paid

    const data = result.data || {}

    const amount =

      extractAmount(payload) ??

      (paid ? paidAmountFromBakong(data, extractAmount(payload) ?? 0.01) : null) ??

      extractAmount(data?.data)



    return sendJson(res, 200, {

      ...data,

      _dyna: {

        paid,

        md5: result.matchedMd5 || md5,

        bakongHash: bakongHash || null,

        method: result.method,

        hasJwt: true,

        hosted: true,

        amount,

        gateway: 'bakong-khqr',

        verifiedAt: Date.now(),

      },

    })

  } catch (err) {

    return sendJson(res, 502, {

      responseCode: 1,

      errorCode: 1,

      responseMessage: String(err.message),

      data: null,

      _dyna: { paid: false, md5, hasJwt: true, hosted: true },

    })

  }

}


