-- One-time migration: converts an existing Command Dashboard database (the
-- old admin/employee model, 1 CP-equivalent "admin" + up to 3 fixed admin
-- accounts) to the CP/DCP/ACP/Inspector rank system. Run this once, in the
-- Supabase SQL Editor, against a database that already has data —
-- supabase/schema.sql is for a project that's never been seeded at all.
--
-- This deletes the `admin-3` account (the app never seeds a third fixed
-- account under the new model) and clears all active sessions (everyone
-- signs in again once, which is expected for an auth-model change).

-- 1. Rename admins -> personnel, introduce rank.
alter table public.admins rename to personnel;
alter table public.personnel add column if not exists rank text;
update public.personnel set rank = 'cp' where id = 'admin-1';
update public.personnel set rank = 'dcp' where id = 'admin-2';
delete from public.personnel where id = 'admin-3';
alter table public.personnel alter column rank set not null;
alter table public.personnel add constraint personnel_rank_check check (rank in ('cp', 'dcp', 'acp', 'inspector'));

-- 2. employees: track which Inspector manages each constable. Existing
--    constables come out of this as unassigned (visible to CP/DCP/ACP,
--    not yet owned by any Inspector) until you assign them.
alter table public.employees add column if not exists inspector_id text references public.personnel (id) on delete set null;
create index if not exists employees_inspector_id_idx on public.employees (inspector_id);

-- 3. sessions: widen role values to the rank system.
delete from public.sessions;
alter table public.sessions drop constraint if exists sessions_role_check;
alter table public.sessions add constraint sessions_role_check check (role in ('cp', 'dcp', 'acp', 'inspector', 'employee'));
