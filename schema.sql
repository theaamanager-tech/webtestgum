-- =====================================================================
--  VERDENT° — Full Schema  (run ONCE in Supabase SQL Editor)
--  Direct-purchase QRIS flow (Pakasir) + serverless fulfillment.
--  Buyers (anon) can read ONLY catalog + stock counts. Everything secret
--  (stock payloads, orders, coupons, config) is service-role only.
-- =====================================================================

drop function if exists public.claim_stock(uuid, text);
drop view if exists public.variant_stock;
drop table if exists public.orders      cascade;
drop table if exists public.stock_items cascade;
drop table if exists public.coupons     cascade;
drop table if exists public.app_config  cascade;
drop table if exists public.variants    cascade;
drop table if exists public.products    cascade;

-- ============================ PRODUCTS ============================
create table public.products (
  id          text primary key,
  name        text not null,
  cat         text not null default 'ai',         -- ai | editing | account
  initials    text not null default '',
  tag         text not null default '',
  subtitle    text not null default '',
  image_url   text not null default '',           -- gambar produk (URL)
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================ VARIANTS ===========================
create table public.variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  text not null references public.products(id) on delete cascade,
  name        text not null,
  price       int,                                 -- null = "Chat Admin"
  snk         text not null default '',            -- Terms & Conditions per variant
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on public.variants (product_id);

-- ========================== STOCK ITEMS ==========================
create table public.stock_items (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.variants(id) on delete cascade,
  payload     text not null,                       -- 1 line = 1 unit (account/cred/link)
  status      text not null default 'available',   -- available | sold
  order_id    text,
  created_at  timestamptz not null default now(),
  sold_at     timestamptz
);
create index on public.stock_items (variant_id, status);

-- ============================ COUPONS ============================
create table public.coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  type        text not null default 'percent',     -- percent | fixed
  value       int  not null default 0,             -- percent (0-100) or rupiah
  active      boolean not null default true,
  max_uses    int  not null default 0,             -- 0 = unlimited
  used_count  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ============================= ORDERS ============================
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  order_id      text unique not null,              -- random claim token / Pakasir ref
  variant_id    uuid references public.variants(id),
  product_name  text,
  variant_name  text,
  unit_price    int not null default 0,
  quantity      int not null default 1,
  discount      int not null default 0,
  amount        int not null default 0,            -- final charged amount
  coupon_code   text,
  status        text not null default 'pending',   -- pending | paid | expired | failed
  payment_method text not null default 'qris',
  qr_string     text,
  delivery_text text,                              -- built on fulfillment
  buyer_contact text default '',
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index on public.orders (order_id);

-- =========================== APP CONFIG ==========================
create table public.app_config (
  id             int primary key default 1 check (id = 1),
  pakasir_project text default '',
  pakasir_api_key text default '',
  pakasir_mode    text default 'sandbox',          -- sandbox | live
  webhook_url     text default '',
  store_name      text default 'Verdent°',
  store_tagline   text default 'Produk Digital Premium',
  store_hero_title text default 'Beli sekali klik, akun langsung jadi.',
  store_hero_subtitle text default 'Pilih produk, bayar via QRIS, akun langsung terkirim otomatis.',
  store_footer_text text default '© Verdent° · Semua transaksi via QRIS aman.',
  bantuan_contact  text default '',
  bantuan_faq      text default '',
  annon_active     boolean default false,
  annon_text       text default 'New feature is ready to use, let''s try',
  annon_badge_text text default 'Version 1.0',
  annon_badge_bg   text default '#28C39D',
  annon_badge_text_color text default '#0D0E10',
  annon_bg         text default 'rgba(40,195,157,0.12)',
  annon_text_color text default '#CFEEE6',
  -- Social Media
  telegram_bot_token           text default '',
  telegram_chat_id             text default '',
  soc_wa_active               boolean default false,
  soc_wa_number               text default '',
  soc_tele_active             boolean default false,
  soc_tele_channel            text default '',
  soc_tele_channel_active     boolean default false,
  soc_tele_bot                text default '',
  soc_tele_bot_active         boolean default false,
  soc_x_active                boolean default false,
  soc_x_link                  text default '',
  soc_ig_active               boolean default false,
  soc_ig_link                 text default '',
  -- Background list (stored as JSONB array of {id,file,label})
  bg_list         jsonb not null default '[
    {"id":"bg-1","file":"bg/moon-sky-night-background-asset-game-2d-futuristic-generative-ai.jpg","label":"Moon Sky"},
    {"id":"bg-2","file":"bg/halloween-scene-illustration-anime-style.jpg","label":"Halloween"},
    {"id":"bg-3","file":"bg/anime-style-mythical-dragon-creature.jpg","label":"Dragon"},
    {"id":"bg-4","file":"bg/mythical-dragon-beast-anime-style.jpg","label":"Dragon Beast"},
    {"id":"bg-5","file":"bg/illustration-anime-character-rain.jpg","label":"Rain"}
  ]'::jsonb,
  updated_at      timestamptz not null default now()
);
insert into public.app_config (id) values (1) on conflict do nothing;

-- ============================ RLS RULES ==========================
alter table public.products    enable row level security;
alter table public.variants    enable row level security;
alter table public.stock_items enable row level security;
alter table public.coupons     enable row level security;
alter table public.orders      enable row level security;
alter table public.app_config  enable row level security;

-- Buyers may read ONLY the catalog. No write, no secret tables.
create policy "products_read" on public.products for select using (true);
create policy "variants_read" on public.variants for select using (true);
-- (No policies on stock_items / coupons / orders / app_config => anon denied.
--  The serverless functions use the service-role key which bypasses RLS.)

-- ====================== STOCK COUNT (safe view) =================
create view public.variant_stock as
  select variant_id, count(*) filter (where status = 'available') as available
  from public.stock_items group by variant_id;
grant select on public.variant_stock to anon, authenticated;

-- ==================== ATOMIC MULTI-UNIT CLAIM ==================
-- Locks and claims exactly ONE available unit for an order. Returns its
-- payload, or null if sold out. Prevents the same unit selling twice.
-- fulfillment.js calls this in a loop to claim N units.
create or replace function public.claim_stock(p_variant uuid, p_order text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_payload text;
begin
  select id, payload into v_id, v_payload
    from public.stock_items
   where variant_id = p_variant and status = 'available'
   order by created_at
   for update skip locked
   limit 1;
  if not found then return null; end if;
  update public.stock_items
     set status='sold', order_id=p_order, sold_at=now()
   where id = v_id;
  return v_payload;
end;
$$;
-- Only service role calls this (no grant to anon).

-- =========================== SEED DATA ===========================
-- Kosong — tidak ada default. Admin akan tambah produk via panel.

-- ======================== STORAGE BUCKETS =======================
-- Buat storage bucket "bg-images" lewat Supabase Dashboard:
--   Storage → New bucket → name: "bg-images", public: true
--   (atau via SQL: insert into storage.buckets ...)
--   Policy: Allow public SELECT on storage.objects where bucket_id = 'bg-images'
--   supabase.storage.buckets sudah ada "product-images" — tambah "bg-images" manual.
