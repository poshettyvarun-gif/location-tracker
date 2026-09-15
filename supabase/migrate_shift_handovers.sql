-- Run once in Supabase SQL Editor before deploying the A -> B -> C handover flow.
-- It stores the explicit approval for the next shift at each place of posting.

create table if not exists public.shift_handovers (
  posting_key text not null,
  duty_date date not null,
  unlocked_through text not null check (unlocked_through in ('B', 'C')),
  released_by text not null references public.employees (id) on delete cascade,
  released_at timestamptz not null default now(),
  primary key (posting_key, duty_date)
);

alter table public.shift_handovers enable row level security;
