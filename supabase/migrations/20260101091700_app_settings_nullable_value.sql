-- -----------------------------------------------------------------------------
-- Allow app_settings.value to be nullable
-- Enables optional settings (like announcement_banner) to be set to NULL when disabled
-- -----------------------------------------------------------------------------

alter table public.app_settings alter column value drop not null;

-- Update set_app_setting RPC to support NULL values when disabling features
create or replace function public.set_app_setting(p_key text, p_value jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  insert into public.app_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.set_app_setting to authenticated;
