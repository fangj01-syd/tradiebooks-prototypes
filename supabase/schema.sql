-- Run in Supabase SQL Editor before adding the URL and publishable key to the website.
create table if not exists public.books (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.books enable row level security;
revoke all on public.books from anon;
grant select, insert, update on public.books to authenticated;

create policy "Read own book" on public.books
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own book" on public.books
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own book" on public.books
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- One atomic write per book. A stale device cannot silently overwrite newer cloud data.
create or replace function public.save_book(p_expected bigint, p_data jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare new_revision bigint;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'invoices') <> 'array'
     or jsonb_typeof(p_data -> 'receipts') <> 'array' then
    raise exception 'invalid_book';
  end if;
  if p_expected = 0 then
    insert into public.books(user_id, data)
    values ((select auth.uid()), p_data)
    on conflict (user_id) do nothing
    returning revision into new_revision;
  else
    update public.books
      set data = p_data, revision = revision + 1, updated_at = now()
      where user_id = (select auth.uid()) and revision = p_expected
      returning revision into new_revision;
  end if;
  if new_revision is null then raise exception 'revision_conflict'; end if;
  return new_revision;
end;
$$;
revoke all on function public.save_book(bigint, jsonb) from public, anon;
grant execute on function public.save_book(bigint, jsonb) to authenticated;
