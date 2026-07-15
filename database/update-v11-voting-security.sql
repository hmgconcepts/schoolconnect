
-- ========================================================
-- SCHOOL CONNECT V11: Voting UUID/type repair + secure poll workflow
-- Fixes legacy databases where poll_votes.candidate_id was UUID, causing
-- "invalid input syntax for type uuid" when candidate IDs like c1/c2 are used.
-- Safe to run repeatedly after the main schemas.
-- ========================================================
create extension if not exists "uuid-ossp";

do $$ begin
  alter table public.polls add column if not exists max_votes integer default 1;
  alter table public.polls add column if not exists created_by uuid references public.profiles(id) on delete set null;
exception when undefined_table then null; end $$;

do $$ begin
  -- Convert candidate_id to text even if an older schema created it as uuid.
  alter table public.poll_votes alter column candidate_id type text using candidate_id::text;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.poll_votes add column if not exists voter_id uuid references public.profiles(id) on delete cascade;
  alter table public.poll_votes add column if not exists voted_at timestamptz default now();
exception when undefined_table then null; end $$;

create index if not exists polls_status_created_idx on public.polls(status, created_at desc);
create index if not exists poll_votes_poll_voter_idx on public.poll_votes(poll_id, voter_id);

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

drop policy if exists "pv_read"   on public.poll_votes;
drop policy if exists "pv_insert" on public.poll_votes;
drop policy if exists "pv_update" on public.poll_votes;
drop policy if exists "pv_delete_v11" on public.poll_votes;
drop policy if exists "pv_read" on public.poll_votes;
create policy "pv_read" on public.poll_votes for select using (auth.uid() = voter_id or public.is_staff(auth.uid()));
drop policy if exists "pv_insert" on public.poll_votes;
create policy "pv_insert" on public.poll_votes for insert with check (
  auth.uid() = voter_id
  and exists (select 1 from public.polls p where p.id = poll_id and coalesce(p.status,'open') = 'open')
);
drop policy if exists "pv_update" on public.poll_votes;
create policy "pv_update" on public.poll_votes for update using (auth.uid() = voter_id) with check (auth.uid() = voter_id);
drop policy if exists "pv_delete_v11" on public.poll_votes;
create policy "pv_delete_v11" on public.poll_votes for delete using (auth.uid() = voter_id or public.is_staff(auth.uid()));

-- Strict family-safe ID-card visibility: staff manage; student/parent can only
-- read cards connected to themselves/their child.
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
