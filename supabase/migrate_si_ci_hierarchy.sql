-- Run once in Supabase SQL Editor after migrate_ranks.sql.
-- Adds Inspector-created SI/CI accounts and preserves existing records.
alter table public.personnel add column if not exists supervisor_inspector_id text references public.personnel (id) on delete set null;
create index if not exists personnel_supervisor_inspector_id_idx on public.personnel (supervisor_inspector_id);
alter table public.personnel drop constraint if exists personnel_rank_check;
alter table public.personnel add constraint personnel_rank_check check (rank in ('cp', 'dcp', 'acp', 'si', 'ci', 'inspector'));
delete from public.sessions;
alter table public.sessions drop constraint if exists sessions_role_check;
alter table public.sessions add constraint sessions_role_check check (role in ('cp', 'dcp', 'acp', 'si', 'ci', 'inspector', 'employee'));
