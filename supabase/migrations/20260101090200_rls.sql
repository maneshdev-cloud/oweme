-- =============================================================================
-- OweMe — 0003 row level security
--
-- RLS is the defence, not the frontend. Assume someone has the anon key and
-- calls PostgREST with arbitrary ids: every table below is locked to "you may
-- only touch rows you are a party to", and the anon role gets nothing at all.
--
-- Design notes:
--  * profiles: a user reads/writes their own row only. Other people's names,
--    usernames and avatars are exposed through the `public_profiles` VIEW and
--    the `search_people()` RPC, both of which return public columns only.
--  * notifications: users can read/mark-their-own, but they cannot INSERT or
--    craft one — notifications are created server-side (triggers/actions).
--  * app_settings / admin_* : readable where the UI needs it, writable only by
--    the service role through an admin-checked server action.
-- =============================================================================

alter table public.profiles               enable row level security;
alter table public.admin_users            enable row level security;
alter table public.friendships            enable row level security;
alter table public.expenses               enable row level security;
alter table public.expense_events         enable row level security;
alter table public.groups                 enable row level security;
alter table public.group_members          enable row level security;
alter table public.group_expenses         enable row level security;
alter table public.group_expense_shares   enable row level security;
alter table public.settlements            enable row level security;
alter table public.notifications          enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.app_settings           enable row level security;
alter table public.archived_records       enable row level security;
alter table public.user_exports           enable row level security;
alter table public.admin_audit_log        enable row level security;

-- Nobody unauthenticated touches application tables directly.
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- no delete policy: profiles disappear with the auth user.

-- -----------------------------------------------------------------------------
-- admin_users — you may learn your own admin status; nobody writes from a client.
-- -----------------------------------------------------------------------------
drop policy if exists admin_users_select on public.admin_users;
create policy admin_users_select on public.admin_users
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- friendships
-- -----------------------------------------------------------------------------
drop policy if exists friendships_select_party on public.friendships;
create policy friendships_select_party on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid() or public.is_admin());

drop policy if exists friendships_insert_as_requester on public.friendships;
create policy friendships_insert_as_requester on public.friendships
  for insert to authenticated
  with check (requester_id = auth.uid() and addressee_id <> auth.uid());

drop policy if exists friendships_update_party on public.friendships;
create policy friendships_update_party on public.friendships
  for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid())
  with check (requester_id = auth.uid() or addressee_id = auth.uid());
-- no delete policy: a declined/cancelled request is history, not a hole.

-- -----------------------------------------------------------------------------
-- expenses
-- -----------------------------------------------------------------------------
drop policy if exists expenses_select_participant on public.expenses;
create policy expenses_select_participant on public.expenses
  for select to authenticated
  using (payer_id = auth.uid() or debtor_id = auth.uid() or public.is_admin());

drop policy if exists expenses_insert_participant on public.expenses;
create policy expenses_insert_participant on public.expenses
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (payer_id = auth.uid() or debtor_id = auth.uid())
  );

drop policy if exists expenses_update_participant on public.expenses;
create policy expenses_update_participant on public.expenses
  for update to authenticated
  using (payer_id = auth.uid() or debtor_id = auth.uid())
  with check (payer_id = auth.uid() or debtor_id = auth.uid());
-- no delete policy: expenses are cancelled, archived, never deleted by a user.

-- -----------------------------------------------------------------------------
-- expense_events — readable by participants, written only by triggers.
-- -----------------------------------------------------------------------------
drop policy if exists expense_events_select_participant on public.expense_events;
create policy expense_events_select_participant on public.expense_events
  for select to authenticated
  using (public.is_expense_participant(expense_id, auth.uid()) or public.is_admin());

-- -----------------------------------------------------------------------------
-- groups + membership
-- -----------------------------------------------------------------------------
drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select to authenticated
  using (created_by = auth.uid() or public.is_group_member(id, auth.uid()) or public.is_admin());

drop policy if exists groups_insert_self on public.groups;
create policy groups_insert_self on public.groups
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner on public.groups
  for update to authenticated
  using (public.is_group_owner(id, auth.uid()))
  with check (public.is_group_owner(id, auth.uid()));

-- An owner may delete a group only while it has no financial history at all.
drop policy if exists groups_delete_empty on public.groups;
create policy groups_delete_empty on public.groups
  for delete to authenticated
  using (
    public.is_group_owner(id, auth.uid())
    and not exists (select 1 from public.group_expenses ge where ge.group_id = id)
    and not exists (select 1 from public.settlements s where s.group_id = id)
  );

drop policy if exists group_members_select_member on public.group_members;
create policy group_members_select_member on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin());

drop policy if exists group_members_insert_member on public.group_members;
create policy group_members_insert_member on public.group_members
  for insert to authenticated
  with check (public.is_group_member(group_id, auth.uid()));
  -- plus: must be an accepted friend — enforced by enforce_group_member_rules()

drop policy if exists group_members_update_owner on public.group_members;
create policy group_members_update_owner on public.group_members
  for update to authenticated
  using (public.is_group_owner(group_id, auth.uid()))
  with check (public.is_group_owner(group_id, auth.uid()));

drop policy if exists group_members_delete_self_or_owner on public.group_members;
create policy group_members_delete_self_or_owner on public.group_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_group_owner(group_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- group expenses + shares
-- -----------------------------------------------------------------------------
drop policy if exists group_expenses_select_member on public.group_expenses;
create policy group_expenses_select_member on public.group_expenses
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()) or public.is_admin());

drop policy if exists group_expenses_insert_member on public.group_expenses;
create policy group_expenses_insert_member on public.group_expenses
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_group_member(group_id, auth.uid()));

drop policy if exists group_expenses_update_member on public.group_expenses;
create policy group_expenses_update_member on public.group_expenses
  for update to authenticated
  using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

drop policy if exists group_expense_shares_select_member on public.group_expense_shares;
create policy group_expense_shares_select_member on public.group_expense_shares
  for select to authenticated
  using (public.is_group_expense_visible(group_expense_id, auth.uid()) or public.is_admin());

drop policy if exists group_expense_shares_insert_member on public.group_expense_shares;
create policy group_expense_shares_insert_member on public.group_expense_shares
  for insert to authenticated
  with check (public.is_group_expense_visible(group_expense_id, auth.uid()));

drop policy if exists group_expense_shares_update_member on public.group_expense_shares;
create policy group_expense_shares_update_member on public.group_expense_shares
  for update to authenticated
  using (public.is_group_expense_visible(group_expense_id, auth.uid()))
  with check (public.is_group_expense_visible(group_expense_id, auth.uid()));

drop policy if exists group_expense_shares_delete_member on public.group_expense_shares;
create policy group_expense_shares_delete_member on public.group_expense_shares
  for delete to authenticated
  using (public.is_group_expense_visible(group_expense_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- settlements
-- -----------------------------------------------------------------------------
drop policy if exists settlements_select_party on public.settlements;
create policy settlements_select_party on public.settlements
  for select to authenticated
  using (
    payer_id = auth.uid()
    or receiver_id = auth.uid()
    or (group_id is not null and public.is_group_member(group_id, auth.uid()))
    or public.is_admin()
  );

drop policy if exists settlements_insert_party on public.settlements;
create policy settlements_insert_party on public.settlements
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (payer_id = auth.uid() or receiver_id = auth.uid())
    and (group_id is null or public.is_group_member(group_id, auth.uid()))
  );

drop policy if exists settlements_update_party on public.settlements;
create policy settlements_update_party on public.settlements
  for update to authenticated
  using (payer_id = auth.uid() or receiver_id = auth.uid())
  with check (payer_id = auth.uid() or receiver_id = auth.uid());

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());
-- Deliberately NO insert policy: a user can never fabricate a notification for
-- themselves or anybody else. Server-side triggers / admin actions create them
-- through their SECURITY DEFINER / service-role path.

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- app_settings — read for everyone signed in (banner / flags / maintenance),
-- write for the service role only (no policy grants a client write).
-- -----------------------------------------------------------------------------
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- retained history — visible to the people who were part of the record.
-- -----------------------------------------------------------------------------
drop policy if exists archived_records_select_participant on public.archived_records;
create policy archived_records_select_participant on public.archived_records
  for select to authenticated
  using (auth.uid() = any (participant_ids) or public.is_admin());

drop policy if exists user_exports_select_own on public.user_exports;
create policy user_exports_select_own on public.user_exports
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_exports_insert_own on public.user_exports;
create policy user_exports_insert_own on public.user_exports
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists admin_audit_log_select_admin on public.admin_audit_log;
create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Table privileges. Policies decide *which rows*; grants decide *which verbs*.
-- Both are needed, and both are set here rather than relying on dashboard
-- defaults.
-- -----------------------------------------------------------------------------
grant select                          on public.profiles                 to authenticated;
grant insert, update                  on public.profiles                 to authenticated;

grant select                          on public.admin_users              to authenticated;

grant select, insert, update          on public.friendships              to authenticated;

grant select, insert, update          on public.expenses                 to authenticated;
grant select                          on public.expense_events           to authenticated;

grant select, insert, update, delete  on public.groups                   to authenticated;
grant select, insert, update, delete  on public.group_members            to authenticated;
grant select, insert, update          on public.group_expenses           to authenticated;
grant select, insert, update, delete  on public.group_expense_shares     to authenticated;

grant select, insert, update          on public.settlements              to authenticated;

grant select, update, delete          on public.notifications            to authenticated;
grant select, insert, update          on public.notification_preferences to authenticated;
grant select                          on public.app_settings             to authenticated;
grant select                          on public.archived_records         to authenticated;
grant select, insert                  on public.user_exports             to authenticated;
grant select                          on public.admin_audit_log          to authenticated;

-- Internal trigger / assertion helpers are not callable by clients.
revoke execute on function
  public.assert_financial_writes_allowed(),
  public.assert_expense_creation_allowed(),
  public.assert_group_expense_insert(),
  public.assert_group_expense_update(),
  public.assert_shares_reconcile(),
  public.assert_share_member(),
  public.protect_financial_delete(),
  public.forbid_event_mutation(),
  public.enforce_expense_transitions(),
  public.enforce_friendship_rules(),
  public.enforce_group_member_rules(),
  public.enforce_settlement_rules(),
  public.enforce_notification_rules(),
  public.log_expense_event(),
  public.add_group_creator_as_owner(),
  public.handle_new_user(),
  public.touch_updated_at()
from public, anon, authenticated;
