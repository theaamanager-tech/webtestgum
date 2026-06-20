-- =====================================================================
--  NOVACIY° — Supabase Schema v2  (run once in Supabase SQL Editor)
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
  store_name      text default 'Novaciy°',
  store_tagline   text default 'Produk Digital Premium',
  store_hero_title text default 'Beli sekali klik, akun langsung jadi.',
  store_hero_subtitle text default 'Pilih produk, bayar via QRIS, akun langsung terkirim otomatis.',
  store_footer_text text default '© Novaciy° · Semua transaksi via QRIS aman.',
  bantuan_contact  text default '',
  bantuan_faq      text default '',
  annon_active     boolean default false,
  annon_text       text default 'New feature is ready to use, let\'s try',
  annon_badge_text text default 'Version 7.8',
  annon_badge_bg   text default '#28C39D',
  annon_badge_text_color text default '#0D0E10',
  annon_bg         text default 'rgba(40,195,157,0.12)',
  annon_text_color text default '#CFEEE6',
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

-- ==================== ATOMIC SINGLE-UNIT CLAIM ==================
-- Locks and claims exactly ONE available unit for an order. Returns its
-- payload, or null if sold out. Prevents the same unit selling twice.
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

-- ========================== SEED DATA ===========================
insert into public.products (id, name, cat, initials, tag, sort_order) values

-- ========== UPGRADE NOTE — if you already ran schema.sql before, run these ALTER statements in Supabase SQL Editor:
-- alter table public.app_config add column if not exists store_name text default 'Novaciy°';
-- alter table public.app_config add column if not exists store_tagline text default 'Produk Digital Premium';
-- alter table public.app_config add column if not exists store_hero_title text default 'Beli sekali klik, akun langsung jadi.';
-- alter table public.app_config add column if not exists store_hero_subtitle text default 'Pilih produk, bayar via QRIS, akun langsung terkirim otomatis.';
-- alter table public.app_config add column if not exists store_footer_text text default '© Novaciy° · Semua transaksi via QRIS aman.';
-- alter table public.app_config add column if not exists bantuan_contact text default '';
-- alter table public.app_config add column if not exists bantuan_faq text default '';
-- alter table public.app_config add column if not exists annon_active boolean default false;
-- alter table public.app_config add column if not exists annon_text text default 'New feature is ready to use, let''s try';
-- alter table public.app_config add column if not exists annon_badge_text text default 'Version 7.8';
-- alter table public.app_config add column if not exists annon_badge_bg text default '#28C39D';
-- alter table public.app_config add column if not exists annon_badge_text_color text default '#0D0E10';
-- alter table public.app_config add column if not exists annon_bg text default 'rgba(40,195,157,0.12)';
-- alter table public.app_config add column if not exists annon_text_color text default '#CFEEE6';
 ('capcut','CapCut Pro','editing','CC','Best Seller',1),
 ('paypal','PayPal Fresh','account','PP','Ready',2),
 ('chatgpt','ChatGPT Plus','ai','GP','Hot',3),
 ('grok','Super Grok','ai','GK','New',4),
 ('gemini','Gemini AI Pro','ai','GM','Promo',5),
 ('canva','Canva Pro','editing','CV','Populer',6);

insert into public.variants (product_id, name, price, snk, sort_order) values
 ('capcut','7 Hari',15000,'Garansi 7 hari. Jangan ganti password & email.',1),
 ('capcut','30 Hari',35000,'Garansi 30 hari penuh. Login max 1 device.',2),
 ('paypal','Domain',3000,'Akun fresh. Wajib ganti password setelah terima.',1),
 ('paypal','Gmail',5000,'Akun fresh + Gmail. Simpan recovery info.',2),
 ('chatgpt','No Garansi',35000,'Tanpa garansi. Jangan ubah data akun.',1),
 ('chatgpt','Full Garansi',60000,'Garansi penuh 30 hari. Login via link kami.',2),
 ('grok','3 Hari',5000,'Trial 3 hari. Tidak bisa diperpanjang.',1),
 ('grok','30 Hari',160000,'Garansi 30 hari. 1 akun 1 user.',2),
 ('gemini','3 Bulan',40000,'Aktif 3 bulan. Jangan logout dari semua device.',1),
 ('gemini','12 Bulan',75000,'Aktif 12 bulan. Garansi replace bila bermasalah.',2),
 ('canva','1 Bulan Invite',3000,'Via invite link. Jangan keluar dari tim.',1),
 ('canva','1 Bulan Individual',10000,'Akun individual 1 bulan.',2),
 ('canva','1 Bulan Owner',null,'Harga custom, chat admin dulu.',3);

-- demo stock so QRIS fulfillment can be tested end-to-end
insert into public.stock_items (variant_id, payload)
select v.id, 'capcut7-demo-'||g||' | user'||g||'@mail.com | passW0rd'||g
from public.variants v cross join generate_series(1,8) g
where v.product_id='capcut' and v.name='7 Hari';

insert into public.stock_items (variant_id, payload)
select v.id, 'chatgpt-full-'||g||' | login: cg'||g||'@mail.com | pass: cgPass'||g
from public.variants v cross join generate_series(1,5) g
where v.product_id='chatgpt' and v.name='Full Garansi';

-- sample coupon
insert into public.coupons (code, type, value, max_uses) values ('HEMAT10','percent',10,0);