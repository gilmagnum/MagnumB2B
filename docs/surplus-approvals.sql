-- ================================================================
-- Surplus approvals — a picker's over-pick waits here for a manager
-- to approve (which writes the increase to Hashavshevet). Additive/safe.
-- Run in Supabase SQL editor before the feature's flag/code goes live.
-- ================================================================

create table if not exists public.surplus_approvals (
  id           uuid        primary key default gen_random_uuid(),
  stock_id     bigint      not null,
  doc_number   bigint,
  account_key  text,
  customer_name text,
  -- surplus lines only: [{ itemkey, size?, ordered, picked, surplus, unitPrice, discountPct, amount }]
  lines        jsonb       not null default '[]'::jsonb,
  units        integer     not null default 0,   -- total surplus units
  amount       numeric     not null default 0,    -- total surplus value, ₪ (pre-VAT)
  picker       text,
  created_by   uuid,                              -- the picker's auth uid
  status       text        not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  approved_by  text,                              -- the approving manager's name
  resolved_by  uuid,                              -- the approving/rejecting manager's uid
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists surplus_approvals_pending_idx on public.surplus_approvals (status, created_at);

-- RLS on, no public policies: reached only through server actions (service_role), which check a
-- picker/manager role. Same model as picking_logs.
alter table public.surplus_approvals enable row level security;
