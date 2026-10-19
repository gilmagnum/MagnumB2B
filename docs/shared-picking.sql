-- ================================================================
-- Shared picking (split-lines) — schema. Run in Supabase SQL editor.
-- Safe/additive. Run BEFORE enabling the shared_picking_enabled flag.
-- The app only touches these tables when the flag is ON, so deploying
-- the code first (flag OFF) does not require these yet.
-- ================================================================

-- Per order line: assignment + that assignee's picked quantity.
create table if not exists public.picking_lines (
  stock_id             bigint      not null,
  line_key             text        not null,
  assigned_picker_id   uuid        references auth.users(id),
  assigned_picker_name text,
  picked_qty           integer     not null default 0,
  updated_at           timestamptz not null default now(),
  primary key (stock_id, line_key)
);

-- Participants on an order (presence + "my part done" + per-picker notes).
create table if not exists public.picking_participants (
  stock_id    bigint      not null,
  picker_id   uuid        not null references auth.users(id),
  picker_name text,
  part_done   boolean     not null default false,
  notes       text,
  updated_at  timestamptz not null default now(),
  primary key (stock_id, picker_id)
);

-- Extend the existing per-order header.
alter table public.picking_sessions
  add column if not exists owner_id   uuid,
  add column if not exists owner_name text,
  add column if not exists mode       text not null default 'solo';  -- 'solo' | 'split'

-- RLS on, no public policies: the app reaches these only through server actions
-- (service_role), which check a picker/manager role. Same model as picking_logs.
alter table public.picking_lines enable row level security;
alter table public.picking_participants enable row level security;

-- Feature flag (default OFF). Toggle from the app (admin) or here.
insert into public.app_settings (key, value)
values ('shared_picking_enabled', 'false'::jsonb)
on conflict (key) do nothing;
