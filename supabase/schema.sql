-- MagnumB2B — Supabase (Postgres) schema — app/presentation layer
-- Hashavshevet stays the source of truth for core data; this is our cache + app state.
-- Field origins noted as (Items.x) or (ExtraNotes NoteID n) / (ExtraSums SuFID n) from SERVER-CONTEXT.md.
-- LOCAL session owns this file. Iterate freely.

-- ============ reference tables ============

-- Size rulers (app-layer scales, e.g. ASXXL, S3646). ExtraNotes NoteID 25 on an item points here by code.
create table if not exists rulers (
  code         text primary key,          -- e.g. 'S3646'
  name         text,                       -- display name
  sizes        text[] not null default '{}', -- ordered size labels, e.g. {'36','37',...}
  active       boolean not null default true
);

-- Colors: color-axis for 2D matrix (ExtraNotes NoteID 29) AND the 2-letter map for 20-char ItemKey shortening.
create table if not exists colors (
  code         text primary key,           -- canonical color key, e.g. 'BLACK'
  name_he      text,
  short_code   text not null,              -- 2-char code for SKU shortening, e.g. 'BK' (must stay unique)
  constraint colors_short_unique unique (short_code)
);

-- Category tree (ניהול קטגוריות). IDs mirror the app (e.g. נעליים=115).
create table if not exists categories (
  id           integer primary key,        -- Hashavshevet/app category id
  parent_id    integer references categories(id),
  title        text not null,
  sort         integer default 0,
  image_url    text,
  active       boolean not null default true
);

-- ============ catalog cache (mirror of Items + extra fields) ============
create table if not exists items (
  itemkey            text primary key,      -- Items.ItemKey (model_color, <=20 chars)
  item_name          text,                  -- Items.ItemName
  foreign_name       text,                  -- Items.ForignName
  sort_group         integer,               -- Items.SortGroup
  price              numeric(12,3),         -- Items.Price
  discount_code      text,                  -- Items.DiscountCode
  barcode            text,                  -- Items.BarCode
  active             boolean default true,  -- NOT Items.Dumi (Dumi=1 -> inactive)
  matrix_flag        boolean default false, -- Items.MatrixFlag
  -- packaging
  per_pack           numeric(12,3),         -- Items.SuF4  (כמות באריזה)
  per_carton         numeric(12,3),         -- ExtraSums SuFID 5 (בקרטון)
  per_bundle         numeric(12,3),         -- ExtraSums SuFID 6 (בחבילה)
  carton_volume      numeric(12,3),         -- ExtraSums SuFID 7
  royalties_pct      numeric(6,3),          -- ExtraSums SuFID 8
  -- app/catalog fields (ExtraNotes)
  brand              text,                  -- NoteID 7
  brand_owner        text,                  -- NoteID 8
  brand_group        text,                  -- NoteID 16
  category_main      text,                  -- NoteID 22
  category_sub       text,                  -- NoteID 23
  group_name         text,                  -- NoteID 24
  season             text,                  -- NoteID 34
  ruler_code         text references rulers(code), -- NoteID 25
  color              text,                  -- NoteID 29 (color-axis header for 2D matrix)
  matrix_size        text,                  -- NoteID 33
  parent_itemkey     text,                  -- NoteID 36 (מק"ט ראשי — links variant/cell to parent)
  is_color_item      boolean default false, -- NoteID 27
  is_carton_size_item boolean default false,-- NoteID 26
  category_keds      text,                  -- NoteID 44
  shown_on_site      boolean default false, -- NoteID 28  (only true => shown/orderable)
  ignore_stock       boolean default false, -- NoteID 31  (allow regular order with no stock)
  -- presentation (app-layer; images NOT in Hashavshevet)
  image_url          text,
  -- sync bookkeeping
  synced_at          timestamptz default now()
);
create index if not exists items_shown_idx    on items (shown_on_site) where shown_on_site;
create index if not exists items_category_idx on items (category_main, category_sub);
create index if not exists items_parent_idx   on items (parent_itemkey);

-- Matrix cells (real per-cell SKUs via IMatrixItems). One row per matrix cell.
create table if not exists item_variants (
  itemkey        text primary key,          -- the cell SKU (e.g. WF3400036)
  parent_itemkey text not null,             -- FItemKey (e.g. WF34000)
  line           integer,                   -- IMatrixItems.Line (size axis index)
  col            integer,                   -- IMatrixItems.Col  (color axis index; 0 = 1D)
  size_label     text,
  color_label    text
);
create index if not exists item_variants_parent_idx on item_variants (parent_itemkey);

-- ============ auth / profiles ============
-- Supabase Auth holds users; this maps them to Hashavshevet identities & roles.
create table if not exists profiles (
  id           uuid primary key,            -- = auth.users.id
  role         text not null check (role in ('agent','customer','picker','admin')),
  account_key  text,                        -- for customer users -> Accounts.AccountKey
  agent_id     integer,                     -- for agent users -> Accounts.Agent
  full_name    text,
  created_at   timestamptz default now()
);

-- ============ cart / order drafts ============
-- Cart lives here until submitted; on submit the bridge writes a temp order to Hashavshevet.
create table if not exists carts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references profiles(id),
  account_key  text not null,               -- the customer being ordered for (agent picks it)
  doc_type     integer not null default 11, -- Hashavshevet DocumentID (11 = order)
  order_kind   text check (order_kind in ('picking','future')), -- לליקוט / עתידי
  status       text not null default 'open' check (status in ('open','submitted','failed')),
  created_at   timestamptz default now()
);
create table if not exists cart_lines (
  id           bigint generated always as identity primary key,
  cart_id      uuid references carts(id) on delete cascade,
  itemkey      text not null,               -- for matrix: the cell SKU; for ruler/regular: the model
  qty          numeric(12,3) not null,      -- in units
  unit         text not null check (unit in ('carton','bundle')), -- min unit = bundle
  price        numeric(12,3),               -- resolved unit price (bridge/Hashavshevet may recompute)
  size_label   text                          -- for ruler items (size written as text on the Hashavshevet line)
);

-- Orders mirror (after the bridge writes to Hashavshevet) — for status screens.
create table if not exists orders (
  hash_stock_id  integer primary key,        -- Stock.ID from Hashavshevet (the app order number)
  cart_id        uuid references carts(id),
  account_key    text not null,
  agent_id       integer,
  doc_type       integer not null default 11,
  status         text,                        -- open / picked / produced (Hashavshevet Status/CloseType)
  total          numeric(14,3),
  created_at     timestamptz default now(),
  produced_at    timestamptz
);

-- ============ RLS ============
-- profiles holds the agent↔agent_id / customer↔account_key mapping — must not leak
-- between users. A logged-in user may read ONLY their own profile row.
-- service_role (sync job, admin provisioning) bypasses RLS and is unaffected.
alter table profiles enable row level security;

drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles
  for select using (auth.uid() = id);

-- Cart/order drafts belong to the profile that created them.
alter table carts enable row level security;
drop policy if exists carts_owner on carts;
create policy carts_owner on carts
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

alter table cart_lines enable row level security;
drop policy if exists cart_lines_owner on cart_lines;
create policy cart_lines_owner on cart_lines
  for all using (exists (select 1 from carts c where c.id = cart_lines.cart_id and c.profile_id = auth.uid()))
  with check (exists (select 1 from carts c where c.id = cart_lines.cart_id and c.profile_id = auth.uid()));

-- Orders mirror: an agent sees orders for their agent_id (admin sees all); service_role writes them.
alter table orders enable row level security;
drop policy if exists orders_agent_select on orders;
create policy orders_agent_select on orders
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid()
            and (p.role = 'admin' or p.agent_id = orders.agent_id))
  );

-- Catalog tables (items, item_variants, rulers, colors, categories) stay WITHOUT RLS:
-- non-sensitive product data read by the browser client. Revisit if an unauthenticated
-- client should be blocked.
