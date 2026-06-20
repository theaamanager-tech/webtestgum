# Novaciy° — Toko Produk Digital (QRIS / Pakasir)

Direct-purchase digital product store with **automatic delivery**. Buyers transact as
guests (no login), pay via **QRIS (Pakasir)**, and the purchased account + per-variant
Terms (SNK) are delivered instantly as a `.txt` file. Built for **Vercel** (static
frontend + serverless `/api` functions) and **Supabase** (Postgres).

## Architecture

```
Buyer  index.html / app.js ──reads catalog (anon)──► Supabase (RLS read-only)
   │  Beli ─► POST /api/create-payment ─► Pakasir QRIS ─► QR shown
   │  poll  ─► GET  /api/order-status  ─► "paid" + delivery_text ─► auto .txt
Pakasir ─webhook─► POST /api/pakasir-webhook ─► verify ─► claim 1 stock, fulfill
Admin  kontrol.html / admin.js ─► POST /api/admin (x-admin-key) ─► service role
```

Secrets (Pakasir api_key, stock credentials, orders, coupons) are **never** exposed to
buyers — only the serverless functions (service role) touch them.

## Deploy (Vercel)

1. **Supabase**: open SQL Editor → paste [`schema.sql`](schema.sql) → Run.
2. **Vercel env vars** (Project → Settings → Environment Variables):
   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | `https://wfaeesuxuqftmlyeizan.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **service_role** key (secret!) |
   | `ADMIN_KEY` | any strong password — your admin login |
3. Push to GitHub → Vercel auto-builds & deploys.
4. **Pakasir**: in the admin panel → *Pakasir API* tab, set project slug + api_key.
   Then in the Pakasir dashboard set the Webhook URL to
   `https://<your-domain>/api/pakasir-webhook`.

## Admin access (hidden)

- The panel lives at **`/kontrol.html`** (not linked anywhere; `/admin.html` redirects away).
- It stays blank until you enter the `ADMIN_KEY`. The key is verified server-side —
  discovering the URL alone is useless.

## Features

**Buyer**
- Guest checkout, single-item **Buy** (no cart, no accounts).
- QRIS billing drawer with coupon field; QR rendered client-side.
- Auto `.txt` delivery (account + SNK) on payment success.

**Admin (`/kontrol.html`)**
- **Insights & Financial**: revenue, paid orders, auto top-sellers chart.
- **Products**: CRUD with variants (price + SNK each).
- **Stock & SNK**: per-variant stock, **bulk add** (textarea or `.txt`/`.csv`, 1 line = 1 unit).
- **Coupons**: create / list / delete (percent or fixed).
- **Pakasir API**: securely store slug / api_key / mode / webhook in Supabase.

## Tables

`products` · `variants` (price + snk) · `stock_items` (secret) · `orders` ·
`coupons` · `app_config` · `variant_stock` (view) · `claim_stock()` (atomic RPC).

## Files

```
index.html / app.js        storefront (buy → QRIS → .txt)
kontrol.html / admin.js     hidden admin panel
config.js                   public anon client (catalog reads only)
api/create-payment.js       create QRIS txn (price/coupon server-side)
api/pakasir-webhook.js      payment webhook → verify → fulfill
api/order-status.js         poll status, self-heal fulfill, return .txt
api/admin.js                key-gated admin operations
lib/                        supabaseAdmin, pakasir, fulfill helpers
schema.sql                  full database setup
```
