-- Deploy the matching website code first, then apply this migration to the
-- existing TradieBooks Supabase project. Existing accounts start their seven
-- days when they next open the book after this migration.
begin;

create table if not exists public.book_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '7 days'),
  constraint book_trials_positive_duration check (ends_at > started_at)
);

alter table public.book_trials enable row level security;
revoke all on public.book_trials from public, anon, authenticated;

-- The browser cannot create or extend trials. The account ID always comes
-- from the verified Supabase JWT, never from a browser-supplied argument.
create or replace function public.get_book_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := (select auth.uid());
  trial_start timestamptz;
  trial_end timestamptz;
begin
  if account_id is null then raise exception 'not_authenticated'; end if;

  insert into public.book_trials (user_id)
  values (account_id)
  on conflict (user_id) do nothing;

  select started_at, ends_at into trial_start, trial_end
    from public.book_trials where user_id = account_id;

  return jsonb_build_object(
    'started_at', trial_start,
    'ends_at', trial_end,
    'can_write', clock_timestamp() < trial_end
  );
end;
$$;
revoke all on function public.get_book_access() from public, anon;
grant execute on function public.get_book_access() to authenticated;

-- Remove the old direct table-write route. All changes must pass through
-- save_book, which checks the trial and preserves revision conflict checks.
revoke insert, update, delete on public.books from authenticated;
drop policy if exists "Create own book" on public.books;
drop policy if exists "Update own book" on public.books;

create or replace function public.save_book(p_expected bigint, p_data jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := (select auth.uid());
  access_status jsonb;
  new_revision bigint;
begin
  if account_id is null then raise exception 'not_authenticated'; end if;
  access_status := public.get_book_access();
  if not (access_status ->> 'can_write')::boolean then
    raise exception 'trial_expired';
  end if;
  if jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'invoices') <> 'array'
     or jsonb_typeof(p_data -> 'receipts') <> 'array' then
    raise exception 'invalid_book';
  end if;

  if p_expected = 0 then
    insert into public.books(user_id, data)
    values (account_id, p_data)
    on conflict (user_id) do nothing
    returning revision into new_revision;
  else
    update public.books
      set data = p_data, revision = revision + 1, updated_at = now()
      where user_id = account_id and revision = p_expected
      returning revision into new_revision;
  end if;
  if new_revision is null then raise exception 'revision_conflict'; end if;
  return new_revision;
end;
$$;
revoke all on function public.save_book(bigint, jsonb) from public, anon;
grant execute on function public.save_book(bigint, jsonb) to authenticated;

commit;
