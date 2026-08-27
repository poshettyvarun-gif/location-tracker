-- PERMANENT CLEANUP — run once in Supabase SQL Editor.
-- This removes every old dashboard account, session, attendance/check-in
-- record. It cannot be undone.
--
-- After running it, open the deployed dashboard and log in with any one of
-- the seven configured mobile numbers. The app will automatically recreate
-- only those seven accounts.

delete from public.sessions;
delete from public.employees;
delete from public.personnel;
delete from public.meta where key = 'seeded';

-- Old optional registration data, if it exists from an earlier version.
do $$
begin
  if to_regclass('public.registration_requests') is not null then
    delete from public.registration_requests;
  end if;
end $$;

-- Supabase blocks direct SQL deletion from storage.objects. After this query
-- succeeds, delete the remaining objects from the `checkin-photos` bucket in
-- the Storage section of the Supabase dashboard.
