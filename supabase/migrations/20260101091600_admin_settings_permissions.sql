-- -----------------------------------------------------------------------------
-- Admin Settings & Maintenance Mode Permissions & RPC
-- -----------------------------------------------------------------------------

-- Allow authenticated administrators to read, insert and update app_settings
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant all on public.app_settings to authenticated;

-- Security Definer RPC to reliably persist settings even if service-role key is unavailable
create or replace function public.set_app_setting(p_key text, p_value jsonb)
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

-- Security Definer RPC to record admin audit entries
create or replace function public.record_admin_audit(p_action text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  insert into public.admin_audit_log (actor_id, action, payload, created_at)
  values (auth.uid(), p_action, p_payload, now());
end;
$$;

grant execute on function public.record_admin_audit to authenticated;
