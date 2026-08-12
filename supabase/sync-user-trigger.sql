-- Run once in the Supabase SQL Editor (Project -> SQL Editor) AFTER the
-- first `prisma migrate dev` has created public.users.
--
-- Supabase Auth owns auth.users (email, password hash, OAuth identities).
-- Prisma owns public.users (the app's domain model, referenced by goals,
-- activities, etc). This trigger keeps public.users in sync so app code
-- never has to touch the auth schema directly.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, name, created_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
