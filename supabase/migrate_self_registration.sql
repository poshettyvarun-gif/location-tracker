-- One-time upgrade for the email OTP registration and ACP approval workflow.
-- Run this in Supabase SQL Editor after migrate_ranks.sql has completed.

alter table public.personnel add column if not exists email text unique;
alter table public.personnel add column if not exists auth_user_id uuid unique;
alter table public.employees add column if not exists email text unique;
alter table public.employees add column if not exists auth_user_id uuid unique;

alter table public.personnel drop constraint if exists personnel_rank_check;
alter table public.personnel add constraint personnel_rank_check
  check (rank in ('cp', 'dcp', 'acp', 'si', 'ci', 'inspector'));

alter table public.sessions drop constraint if exists sessions_role_check;
alter table public.sessions add constraint sessions_role_check
  check (role in ('cp', 'dcp', 'acp', 'si', 'ci', 'inspector', 'employee'));

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  email text unique not null,
  name text not null,
  code text,
  requested_role text not null check (requested_role in ('constable', 'si', 'ci', 'inspector')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text references public.personnel (id) on delete set null
);

alter table public.registration_requests enable row level security;
