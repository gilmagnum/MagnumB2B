-- ================================================================
-- Surplus approvals — a picker's over-pick waits here for a manager to
-- approve; approving writes an ABSOLUTE increase to Hashavshevet via a
-- dedicated bridge op. Additive/safe. Run before the feature goes live.
-- ================================================================

create table if not exists public.surplus_approvals (
  id            uuid        primary key default gen_random_uuid(),
  stock_id      bigint      not null,
  doc_number    bigint,
  account_key   text,
  customer_name text,
  -- surplus lines (ordered/price are from the DOCUMENT, not the client):
  -- [{ itemkey, size?, ordered, picked, surplus, unitPrice, discountPct, amount }]
  lines         jsonb       not null default '[]'::jsonb,
  units         integer     not null default 0,   -- total surplus units
  amount        numeric     not null default 0,    -- total surplus value, ₪ (pre-VAT)
  picker        text,
  created_by    uuid,                              -- the picker's auth uid
  status        text        not null default 'pending',
  approved_by   text,                              -- the approving manager's name
  resolved_by   uuid,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint surplus_status_ck check (status in ('pending','approving','approved','rejected')),
  constraint surplus_nonneg_ck check (units >= 0 and amount >= 0)
);
-- Only one OPEN request per document (prevents a second pending/approving row).
create unique index if not exists surplus_approvals_one_open
  on public.surplus_approvals (stock_id) where status in ('pending','approving');
create index if not exists surplus_approvals_pending_idx on public.surplus_approvals (status, created_at);

-- Append-only audit log of every decision (the status column alone isn't enough).
create table if not exists public.surplus_approval_log (
  id          uuid        primary key default gen_random_uuid(),
  surplus_id  uuid        not null,
  stock_id    bigint      not null,
  action      text        not null,              -- 'approved' | 'rejected'
  units       integer     not null default 0,
  amount      numeric     not null default 0,
  by_name     text,
  by_uid      uuid,
  at          timestamptz not null default now()
);

-- RLS on + REVOKE (standard): reached only through server actions (service_role).
alter table public.surplus_approvals enable row level security;
alter table public.surplus_approval_log enable row level security;
revoke all on public.surplus_approvals from anon, authenticated;
revoke all on public.surplus_approval_log from anon, authenticated;
