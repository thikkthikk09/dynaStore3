# Why MD5 payment check fails on hosted (Vercel)

## What happens

1. User pays in Bakong app.
2. Your site calls `POST /api/check-md5` on Vercel.
3. Vercel server calls Bakong `check_transaction_by_md5` with your JWT.

On **your PC** (`npm start`) this works. On **Vercel** it often fails for **two reasons**:

| Problem | Symptom on `/api/health` | Fix |
|--------|---------------------------|-----|
| **No env vars** | `hasJwt: false` | Add variables below → **Redeploy** |
| **Bakong blocks cloud IPs** | `bakongBlocked: true` | Use **BAKONG_RELAY_URL** (ngrok + `npm start`) |

## Step 1 — Vercel environment variables

[Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables** → **Production**:

| Name | Value |
|------|--------|
| `BAKONG_TOKEN` | JWT starting with `eyJ…` (from `.env`, **not** the `rbk…` code) |
| `BAKONG_EMAIL` | `thikkthikk09@gmail.com` |
| `BAKONG_REGISTER_TOKEN` | `rbk…` code from Bakong register |
| `BAKONG_ACCOUNT` | `ben_sothida@bkrt` |
| `DYNA_SITE_URL` | `https://dyna-store3.vercel.app` |

Then **Deployments** → **⋯** → **Redeploy** (must redeploy after env changes).

Check: open `https://dyna-store3.vercel.app/api/health`  
You want: `"hasJwt": true` and `"bakongReachable": true`.

## Step 2 — If still blocked (`bakongBlocked: true`)

Bakong often returns **HTTP 403** to Vercel servers. MD5 will never work until you add a **relay**:

1. On your PC: `npm start` (port 8787).
2. Install [ngrok](https://ngrok.com): `ngrok http 8787`
3. Copy the HTTPS URL, e.g. `https://abc123.ngrok-free.app`
4. Vercel env: `BAKONG_RELAY_URL` = `https://abc123.ngrok-free.app` (no trailing slash)
5. **Redeploy** again. Keep `npm start` + ngrok running while testing payments.

## Step 3 — Redeploy latest code

Push your repo and redeploy so `/api/env-config`, `/api/khqr-build`, and new health checks are live.

## Quick test

```text
GET  https://dyna-store3.vercel.app/api/health
POST https://dyna-store3.vercel.app/api/check-md5
     body: { "md5": "32-char-from-qr", "token": "eyJ…", "qr": "KHQR-string" }
```

After a real payment, `/_dyna.paid` should be `true`.

## Local vs hosted

| | Local `npm start` | Vercel hosted |
|--|-------------------|---------------|
| MD5 check | Works (your IP) | Needs env + often **relay** |
| Public URL | No | `https://dyna-store3.vercel.app` |
