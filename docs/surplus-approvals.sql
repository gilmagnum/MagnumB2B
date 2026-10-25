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
  -- 'stale' = the document changed after the request; it is terminal (a new request must be opened),
  -- and sits OUTSIDE the one-open-per-document index below so a fresh request can be made.
  constraint surplus_status_ck check (status in ('pending','approving','approved','rejected','stale')),
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
  action      text        not null,              -- approved | rejected | stale | unknown
  units       integer     not null default 0,
  amount      numeric     not null default 0,
  by_name     text,
  by_uid      uuid,
  at          timestamptz not null default now(),
  constraint surplus_log_action_ck check (action in ('approved','rejected','stale','unknown'))
);

-- Truly append-only: even service_role (which bypasses RLS) cannot rewrite history.
create or replace function public.surplus_log_no_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'surplus_approval_log is append-only';
end;
$$;
drop trigger if exists surplus_log_immutable on public.surplus_approval_log;
create trigger surplus_log_immutable
  before update or delete or truncate on public.surplus_approval_log
  for each statement execute function public.surplus_log_no_mutation();

-- RLS on + REVOKE (standard): reached only through server actions (service_role).
alter table public.surplus_approvals enable row level security;
alter table public.surplus_approval_log enable row level security;
revoke all on public.surplus_approvals from anon, authenticated;
revoke all on public.surplus_approval_log from anon, authenticated;
