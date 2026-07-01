-- Harden incentive lifecycle management with DB-side transitions, audit events,
-- safe archive/delete behavior, and a disabled legacy sale RPC.

alter table public.incentives
  add column if not exists archived_at timestamp with time zone null,
  add column if not exists archived_by uuid null,
  add column if not exists archive_reason text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'incentives_archived_by_fkey'
      and conrelid = 'public.incentives'::regclass
  ) then
    alter table public.incentives
      add constraint incentives_archived_by_fkey
      foreign key (archived_by) references public.app_users(user_id) on delete set null;
  end if;
end $$;

alter table public.incentives
  drop constraint if exists incentives_status_check;

alter table public.incentives
  add constraint incentives_status_check check (
    status = any (
      array[
        'pending'::text,
        'active'::text,
        'paused'::text,
        'completed'::text,
        'expired'::text,
        'rejected'::text,
        'archived'::text
      ]
    )
  );

create table if not exists public.incentive_status_events (
  id uuid primary key default gen_random_uuid(),
  incentive_id uuid not null references public.incentives(id) on delete cascade,
  previous_status text null,
  new_status text not null,
  actor_id uuid null references public.app_users(user_id) on delete set null,
  reason text null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_incentive_status_events_incentive_id
  on public.incentive_status_events (incentive_id, created_at desc);

create index if not exists idx_incentive_status_events_actor_id
  on public.incentive_status_events (actor_id);

alter table public.incentive_status_events enable row level security;

drop policy if exists incentive_status_events_select on public.incentive_status_events;
drop policy if exists incentive_status_events_manage on public.incentive_status_events;

create policy incentive_status_events_select
  on public.incentive_status_events
  for select
  to authenticated
  using (public.can_manage_incentives());

create policy incentive_status_events_manage
  on public.incentive_status_events
  for all
  to authenticated
  using (public.can_manage_incentives())
  with check (public.can_manage_incentives());

create or replace function public.log_incentive_status_event(
  p_incentive_id uuid,
  p_previous_status text,
  p_new_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.incentive_status_events (
    incentive_id,
    previous_status,
    new_status,
    actor_id,
    reason
  )
  values (
    p_incentive_id,
    p_previous_status,
    p_new_status,
    auth.uid(),
    nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$function$;

create or replace function public.approve_incentive(p_incentive_id uuid)
returns public.incentives
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current public.incentives%rowtype;
  v_updated public.incentives%rowtype;
begin
  if not public.can_manage_incentives() then
    raise exception 'Not authorized to approve incentives' using errcode = '42501';
  end if;

  select *
  into v_current
  from public.incentives
  where id = p_incentive_id
  for update;

  if not found then
    raise exception 'Incentive not found' using errcode = 'P0002';
  end if;

  if v_current.status <> 'pending' then
    raise exception 'Only pending incentives can be approved' using errcode = '22023';
  end if;

  if v_current.end_time <= now() then
    raise exception 'Cannot approve an incentive after its expiration time' using errcode = '22023';
  end if;

  update public.incentives
  set
    status = 'active',
    approver_id = auth.uid(),
    start_time = coalesce(start_time, now()),
    archived_at = null,
    archived_by = null,
    archive_reason = null,
    updated_at = now()
  where id = p_incentive_id
  returning * into v_updated;

  perform public.log_incentive_status_event(p_incentive_id, v_current.status, v_updated.status, 'approved');
  return v_updated;
end;
$function$;

create or replace function public.pause_incentive(p_incentive_id uuid)
returns public.incentives
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current public.incentives%rowtype;
  v_updated public.incentives%rowtype;
begin
  if not public.can_manage_incentives() then
    raise exception 'Not authorized to pause incentives' using errcode = '42501';
  end if;

  select *
  into v_current
  from public.incentives
  where id = p_incentive_id
  for update;

  if not found then
    raise exception 'Incentive not found' using errcode = 'P0002';
  end if;

  if v_current.status <> 'active' then
    raise exception 'Only active incentives can be paused' using errcode = '22023';
  end if;

  update public.incentives
  set
    status = 'paused',
    updated_at = now()
  where id = p_incentive_id
  returning * into v_updated;

  perform public.log_incentive_status_event(p_incentive_id, v_current.status, v_updated.status, 'paused');
  return v_updated;
end;
$function$;

create or replace function public.resume_incentive(p_incentive_id uuid)
returns public.incentives
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current public.incentives%rowtype;
  v_updated public.incentives%rowtype;
begin
  if not public.can_manage_incentives() then
    raise exception 'Not authorized to resume incentives' using errcode = '42501';
  end if;

  select *
  into v_current
  from public.incentives
  where id = p_incentive_id
  for update;

  if not found then
    raise exception 'Incentive not found' using errcode = 'P0002';
  end if;

  if v_current.status <> 'paused' then
    raise exception 'Only paused incentives can be resumed' using errcode = '22023';
  end if;

  if v_current.end_time <= now() then
    raise exception 'Cannot resume an incentive after its expiration time' using errcode = '22023';
  end if;

  update public.incentives
  set
    status = 'active',
    start_time = coalesce(start_time, now()),
    updated_at = now()
  where id = p_incentive_id
  returning * into v_updated;

  perform public.log_incentive_status_event(p_incentive_id, v_current.status, v_updated.status, 'resumed');
  return v_updated;
end;
$function$;

create or replace function public.reject_incentive(p_incentive_id uuid)
returns public.incentives
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current public.incentives%rowtype;
  v_updated public.incentives%rowtype;
begin
  if not public.can_manage_incentives() then
    raise exception 'Not authorized to reject incentives' using errcode = '42501';
  end if;

  select *
  into v_current
  from public.incentives
  where id = p_incentive_id
  for update;

  if not found then
    raise exception 'Incentive not found' using errcode = 'P0002';
  end if;

  if v_current.status <> 'pending' then
    raise exception 'Only pending incentives can be rejected' using errcode = '22023';
  end if;

  update public.incentives
  set
    status = 'rejected',
    approver_id = auth.uid(),
    updated_at = now()
  where id = p_incentive_id
  returning * into v_updated;

  perform public.log_incentive_status_event(p_incentive_id, v_current.status, v_updated.status, 'rejected');
  return v_updated;
end;
$function$;

create or replace function public.archive_incentive(
  p_incentive_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current public.incentives%rowtype;
  v_has_financial_activity boolean;
begin
  if not public.can_manage_incentives() then
    raise exception 'Not authorized to archive incentives' using errcode = '42501';
  end if;

  select *
  into v_current
  from public.incentives
  where id = p_incentive_id
  for update;

  if not found then
    raise exception 'Incentive not found' using errcode = 'P0002';
  end if;

  if v_current.status = 'archived' then
    return jsonb_build_object('action', 'archived', 'id', p_incentive_id);
  end if;

  select exists (
    select 1 from public.bpo_incentive_progress where incentive_id = p_incentive_id
  ) or exists (
    select 1 from public.incentive_payouts where incentive_id = p_incentive_id
  ) or exists (
    select 1 from public.incentive_progress_events where incentive_id = p_incentive_id
  )
  into v_has_financial_activity;

  if v_current.status = 'pending' and not v_has_financial_activity then
    delete from public.incentives
    where id = p_incentive_id;

    return jsonb_build_object('action', 'deleted', 'id', p_incentive_id);
  end if;

  update public.incentives
  set
    status = 'archived',
    archived_at = now(),
    archived_by = auth.uid(),
    archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where id = p_incentive_id;

  perform public.log_incentive_status_event(
    p_incentive_id,
    v_current.status,
    'archived',
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'archived')
  );

  return jsonb_build_object('action', 'archived', 'id', p_incentive_id);
end;
$function$;

create or replace function public.check_incentive_for_sale(
  p_bpo_id uuid,
  p_state text default null,
  p_sol_months integer default null,
  p_attorney_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  raise exception 'check_incentive_for_sale is deprecated; update lead status to qualified_payable or call record_incentives_for_qualified_lead with a lead_id'
    using errcode = '0A000';
end;
$function$;

create or replace function public.resolve_incentive_bpo_owner(
  p_lead_vendor text,
  p_user_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_requester record;
  v_owner uuid;
begin
  if auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.can_manage_incentives() then
    select au.user_id, au.role, au.center_id
    into v_requester
    from public.app_users au
    where au.user_id = auth.uid();

    if not found then
      return null;
    end if;

    if v_requester.role not in ('publisher_admin', 'publisher_closer')
       or v_requester.center_id is null then
      return null;
    end if;

    select coalesce(c.admin_user_id, fallback_admin.user_id)
    into v_owner
    from public.centers c
    left join lateral (
      select au.user_id
      from public.app_users au
      where au.center_id = c.id
        and au.role = 'publisher_admin'
        and coalesce(lower(au.account_status), 'active') not in ('inactive', 'disabled', 'banned', 'suspended')
      order by au.created_at asc, au.user_id asc
      limit 1
    ) fallback_admin on true
    where c.id = v_requester.center_id
      and coalesce(c.is_active, true) = true
      and (
        nullif(btrim(p_lead_vendor), '') is null
        or lower(btrim(c.lead_vendor)) = lower(btrim(p_lead_vendor))
      )
    limit 1;

    return v_owner;
  end if;

  with candidate_centers as (
    select c.*, 0 as match_priority
    from public.centers c
    where nullif(btrim(p_lead_vendor), '') is not null
      and lower(btrim(c.lead_vendor)) = lower(btrim(p_lead_vendor))
      and coalesce(c.is_active, true) = true

    union all

    select c.*, 1 as match_priority
    from public.app_users au
    join public.centers c
      on c.id = au.center_id
    where p_user_id is not null
      and au.user_id = p_user_id
      and coalesce(c.is_active, true) = true
  )
  select coalesce(c.admin_user_id, fallback_admin.user_id)
  into v_owner
  from candidate_centers c
  left join lateral (
    select au.user_id
    from public.app_users au
    where au.center_id = c.id
      and au.role = 'publisher_admin'
      and coalesce(lower(au.account_status), 'active') not in ('inactive', 'disabled', 'banned', 'suspended')
    order by au.created_at asc, au.user_id asc
    limit 1
  ) fallback_admin on true
  order by c.match_priority asc, c.created_at asc, c.id asc
  limit 1;

  return v_owner;
end;
$function$;

revoke execute on function public.log_incentive_status_event(uuid, text, text, text) from public, anon, authenticated;

revoke execute on function public.approve_incentive(uuid) from public, anon;
revoke execute on function public.pause_incentive(uuid) from public, anon;
revoke execute on function public.resume_incentive(uuid) from public, anon;
revoke execute on function public.reject_incentive(uuid) from public, anon;
revoke execute on function public.archive_incentive(uuid, text) from public, anon;

grant execute on function public.approve_incentive(uuid) to authenticated;
grant execute on function public.pause_incentive(uuid) to authenticated;
grant execute on function public.resume_incentive(uuid) to authenticated;
grant execute on function public.reject_incentive(uuid) to authenticated;
grant execute on function public.archive_incentive(uuid, text) to authenticated;

revoke execute on function public.check_incentive_for_sale(uuid, text, integer, uuid) from public, anon, authenticated, service_role;

revoke execute on function public.resolve_incentive_bpo_owner(text, uuid) from public, anon;
grant execute on function public.resolve_incentive_bpo_owner(text, uuid) to authenticated, service_role;
