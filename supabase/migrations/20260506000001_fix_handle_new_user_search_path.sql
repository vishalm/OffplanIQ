-- Migration: 003_fix_handle_new_user_search_path
-- Pin search_path and schema-qualify table refs in handle_new_user().
-- Without this, the trigger fires from auth.users with an unsafe search_path
-- and Postgres can't resolve unqualified user_profiles / alert_preferences,
-- which surfaces as "Database error creating new user" from the auth admin API.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email) values (new.id, new.email);
  insert into public.alert_preferences (user_id) values (new.id);
  return new;
end;
$$;
