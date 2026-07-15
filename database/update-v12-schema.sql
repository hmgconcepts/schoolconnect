

-- ========================================================
-- SCHOOL CONNECT V12: Idempotent policies, voting repair, ownership locks,
-- persistent notifications support, and staff geofenced attendance settings.
-- Safe to run repeatedly after complete-schema/schema.
-- ========================================================
create extension if not exists "uuid-ossp";

-- Parents policy idempotency fix: prevents ERROR 42710 policy already exists.
drop policy if exists "parents_read" on public.parents;
drop policy if exists "parents_write" on public.parents;
drop policy if exists "parents_read" on public.parents;
create policy "parents_read" on public.parents for select using (auth.role() = 'authenticated');
drop policy if exists "parents_write" on public.parents;
create policy "parents_write" on public.parents for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- Voting UUID/type repair: legacy databases may have candidate_id as uuid.
do $$ begin
  alter table public.poll_votes alter column candidate_id type text using candidate_id::text;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.polls add column if not exists max_votes integer default 1;
  alter table public.polls add column if not exists created_by uuid references public.profiles(id) on delete set null;
  alter table public.poll_votes add column if not exists voter_id uuid references public.profiles(id) on delete cascade;
  alter table public.poll_votes add column if not exists voted_at timestamptz default now();
exception when undefined_table then null; end $$;

drop policy if exists "polls_read"  on public.polls;
drop policy if exists "polls_write" on public.polls;
drop policy if exists "polls_update_v11" on public.polls;
drop policy if exists "polls_delete_v11" on public.polls;
drop policy if exists "polls_read" on public.polls;
create policy "polls_read" on public.polls for select using (auth.role() = 'authenticated');
drop policy if exists "polls_write" on public.polls;
create policy "polls_write" on public.polls for insert with check (public.is_staff(auth.uid()));
drop policy if exists "polls_update_v11" on public.polls;
create policy "polls_update_v11" on public.polls for update using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
drop policy if exists "polls_delete_v11" on public.polls;
create policy "polls_delete_v11" on public.polls for delete using (public.is_admin(auth.uid()));

drop policy if exists "pv_read" on public.poll_votes;
drop policy if exists "pv_insert" on public.poll_votes;
drop policy if exists "pv_update" on public.poll_votes;
drop policy if exists "pv_delete_v11" on public.poll_votes;
drop policy if exists "pv_read" on public.poll_votes;
create policy "pv_read" on public.poll_votes for select using (auth.uid() = voter_id or public.is_staff(auth.uid()));
drop policy if exists "pv_insert" on public.poll_votes;
create policy "pv_insert" on public.poll_votes for insert with check (
  auth.uid() = voter_id and exists (select 1 from public.polls p where p.id = poll_id and coalesce(p.status,'open') = 'open')
);
drop policy if exists "pv_update" on public.poll_votes;
create policy "pv_update" on public.poll_votes for update using (auth.uid() = voter_id) with check (auth.uid() = voter_id);
drop policy if exists "pv_delete_v11" on public.poll_votes;
create policy "pv_delete_v11" on public.poll_votes for delete using (auth.uid() = voter_id or public.is_staff(auth.uid()));

-- Staff geofenced attendance settings, configured by admin in Settings.
do $$ begin
  alter table public.school_settings add column if not exists latitude numeric;
  alter table public.school_settings add column if not exists longitude numeric;
  alter table public.school_settings add column if not exists geo_radius_m integer default 200;
  alter table public.school_settings add column if not exists enforce_geofence boolean default true;
  alter table public.school_settings add column if not exists geo_updated_at timestamptz;
exception when undefined_table then null; end $$;

-- Ownership columns for teacher/staff-only editing.
do $$ begin
  alter table public.health add column if not exists recorded_by_id uuid references public.profiles(id) on delete set null;
  alter table public.reports add column if not exists generated_by uuid references public.profiles(id) on delete set null;
  alter table public.helpdesk_tickets add column if not exists submitted_by uuid references public.profiles(id) on delete set null;
exception when undefined_table then null; end $$;

-- Health/clinic: staff may read; only owner or admin may edit/delete.
drop policy if exists "hlth_read" on public.health;
drop policy if exists "hlth_write" on public.health;
drop policy if exists "hlth_insert_v12" on public.health;
drop policy if exists "hlth_update_v12" on public.health;
drop policy if exists "hlth_delete_v12" on public.health;
drop policy if exists "hlth_read" on public.health;
create policy "hlth_read" on public.health for select using (
  public.is_staff(auth.uid()) or public.is_parent_of(auth.uid(), student_id) or student_id in (select id from public.students where user_id = auth.uid())
);
drop policy if exists "hlth_insert_v12" on public.health;
create policy "hlth_insert_v12" on public.health for insert with check (public.is_staff(auth.uid()));
drop policy if exists "hlth_update_v12" on public.health;
create policy "hlth_update_v12" on public.health for update using (public.is_admin(auth.uid()) or recorded_by_id = auth.uid()) with check (public.is_admin(auth.uid()) or recorded_by_id = auth.uid());
drop policy if exists "hlth_delete_v12" on public.health;
create policy "hlth_delete_v12" on public.health for delete using (public.is_admin(auth.uid()) or recorded_by_id = auth.uid());

-- Helpdesk: staff can read; ticket owner/assignee/admin can update; admin can delete.
drop policy if exists "hd_all" on public.helpdesk_tickets;
drop policy if exists "hd_select_v12" on public.helpdesk_tickets;
drop policy if exists "hd_insert_v12" on public.helpdesk_tickets;
drop policy if exists "hd_update_v12" on public.helpdesk_tickets;
drop policy if exists "hd_delete_v12" on public.helpdesk_tickets;
drop policy if exists "hd_select_v12" on public.helpdesk_tickets;
create policy "hd_select_v12" on public.helpdesk_tickets for select using (public.is_staff(auth.uid()) or submitted_by = auth.uid() or assignee = auth.uid());
drop policy if exists "hd_insert_v12" on public.helpdesk_tickets;
create policy "hd_insert_v12" on public.helpdesk_tickets for insert with check (auth.role() = 'authenticated');
drop policy if exists "hd_update_v12" on public.helpdesk_tickets;
create policy "hd_update_v12" on public.helpdesk_tickets for update using (public.is_admin(auth.uid()) or submitted_by = auth.uid() or assignee = auth.uid()) with check (public.is_admin(auth.uid()) or submitted_by = auth.uid() or assignee = auth.uid());
drop policy if exists "hd_delete_v12" on public.helpdesk_tickets;
create policy "hd_delete_v12" on public.helpdesk_tickets for delete using (public.is_admin(auth.uid()) or submitted_by = auth.uid());

-- Reports table: staff read; creator/admin modify.
drop policy if exists "rep_all" on public.reports;
drop policy if exists "rep_select_v12" on public.reports;
drop policy if exists "rep_insert_v12" on public.reports;
drop policy if exists "rep_update_v12" on public.reports;
drop policy if exists "rep_delete_v12" on public.reports;
drop policy if exists "rep_select_v12" on public.reports;
create policy "rep_select_v12" on public.reports for select using (public.is_staff(auth.uid()));
drop policy if exists "rep_insert_v12" on public.reports;
create policy "rep_insert_v12" on public.reports for insert with check (public.is_staff(auth.uid()));
drop policy if exists "rep_update_v12" on public.reports;
create policy "rep_update_v12" on public.reports for update using (public.is_admin(auth.uid()) or generated_by = auth.uid()) with check (public.is_admin(auth.uid()) or generated_by = auth.uid());
drop policy if exists "rep_delete_v12" on public.reports;
create policy "rep_delete_v12" on public.reports for delete using (public.is_admin(auth.uid()) or generated_by = auth.uid());

-- Generic module records (reports, counselling, wellbeing, etc.): staff can read,
-- creator/admin can modify; family users only modify their own allowed family records.
drop policy if exists "mr_update_family" on public.module_records;
drop policy if exists "mr_update_v12_owner" on public.module_records;
drop policy if exists "mr_delete_v12_owner" on public.module_records;
drop policy if exists "mr_update_v12_owner" on public.module_records;
create policy "mr_update_v12_owner" on public.module_records for update using (
  public.is_admin(auth.uid()) or created_by = auth.uid()
) with check (public.is_admin(auth.uid()) or created_by = auth.uid());
drop policy if exists "mr_delete_v12_owner" on public.module_records;
create policy "mr_delete_v12_owner" on public.module_records for delete using (public.is_admin(auth.uid()) or created_by = auth.uid());

-- ID cards remain private to staff, owning student, or linked parent.
drop policy if exists "read_idcards" on public.idcards;
drop policy if exists "write_idcards" on public.idcards;
drop policy if exists "read_idcards" on public.idcards;
create policy "read_idcards" on public.idcards for select using (
  public.is_staff(auth.uid())
  or (person_type = 'student' and person_id in (select id from public.students where user_id = auth.uid()))
  or (person_type = 'student' and public.is_parent_of(auth.uid(), person_id))
);
drop policy if exists "write_idcards" on public.idcards;
create policy "write_idcards" on public.idcards for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
