-- =============================================================================
-- OweMe — 0008 groups RLS fix
-- Fixes SELECT policy on public.groups so the group creator can select the group
-- even before or as the AFTER INSERT trigger adds them to group_members.
-- =============================================================================

drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select to authenticated
  using (created_by = auth.uid() or public.is_group_member(id, auth.uid()) or public.is_admin());
