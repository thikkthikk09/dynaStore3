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
| `BAKONG_EMAIL` | `thikkthikk09@gmail.com` |
| `BAKONG_REGISTER_TOKEN` | `rbk82qAU7sFjn7CG2mAP-CA0_mKVz_RNVRcNlA60b3oNkY` (register code — **not** MD5 JWT) |
| `BAKONG_TOKEN` | JWT starting with `eyJ…` (optional if register token renew works) |
| `BAKONG_ACCOUNT` | `ben_sothida@bkrt` |
| `DYNA_SITE_URL` | `https://dyna-store3.vercel.app` |

Then **Deployments** → **⋯** → **Redeploy** (must redeploy after env changes).

Check: open `https://dyna-store3.vercel.app/api/health`  
You want: `"hasJwt": true` and `"bakongReachable": true`.

## Step 2 — Relay (required for Vercel top-up)

Bakong returns **HTTP 403** to Vercel. Use the built-in tunnel:

```bash
npm install
npm run relay
```

Copy the **https** URL printed in the terminal.

**Option A — Easiest:** Share `https://YOUR-TUNNEL/index.html` as your shop link (payments work fully).

**Option B — Keep Vercel UI:** On `dyna-store3.vercel.app` → Top up → yellow box → paste URL → **Save relay**. Keep `npm run relay` running.

Windows: double-click `start-relay.bat`.

Optional Vercel env: `BAKONG_RELAY_URL` = same https URL → redeploy.

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
