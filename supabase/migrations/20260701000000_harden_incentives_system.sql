-- Harden incentive progress, payout idempotency, and center-level publisher visibility.

create unique index if not exists uniq_bpo_incentive_progress_incentive_bpo
  on public.bpo_incentive_progress (incentive_id, bpo_id);

create unique index if not exists uniq_incentive_payouts_incentive_bpo
  on public.incentive_payouts (incentive_id, bpo_id);

create index if not exists idx_bpo_incentive_progress_bpo_id
  on public.bpo_incentive_progress (bpo_id);

create index if not exists idx_bpo_incentive_progress_incentive_id
  on public.bpo_incentive_progress (incentive_id);

create table if not exists public.incentive_progress_events (
  id uuid primary key default gen_random_uuid(),
  incentive_id uuid not null references public.incentives(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  bpo_id uuid not null references public.app_users(user_id) on delete cascade,
  sale_state varchar(2) null,
  sol_months integer null,
  attorney_id uuid null references public.attorney_profiles(user_id) on delete set null,
  qualified_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint incentive_progress_events_sol_months_check check (sol_months is null or sol_months >= 0)
);

create unique index if not exists uniq_incentive_progress_events_incentive_lead
  on public.incentive_progress_events (incentive_id, lead_id);

create index if not exists idx_incentive_progress_events_bpo_id
  on public.incentive_progress_events (bpo_id);

create index if not exists idx_incentive_progress_events_lead_id
  on public.incentive_progress_events (lead_id);

alter table public.incentive_progress_events enable row level security;

create or replace function public.can_read_center_incentive_owner(p_bpo_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    public.can_manage_incentives()
    or p_bpo_id = auth.uid()
    or exists (
      select 1
      from public.app_users viewer
      left join public.app_users owner
        on owner.user_id = p_bpo_id
      left join public.centers owner_center
        on owner_center.admin_user_id = p_bpo_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('publisher_admin', 'publisher_closer')
        and viewer.center_id is not null
        and (
          owner.center_id = viewer.center_id
          or owner_center.id = viewer.center_id
        )
    );
$function$;

drop function if exists public.resolve_incentive_bpo_owner(text);

create or replace function public.resolve_incentive_bpo_owner(
  p_lead_vendor text,
  p_user_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
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
$function$;

create or replace function public.create_incentive_with_rules(
  p_title text,
  p_description text,
  p_payout_amount numeric,
  p_target_type text,
  p_target_quantity integer,
  p_end_time timestamp with time zone,
  p_rules jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_incentive_id uuid;
  v_rule jsonb;
  v_state text;
  v_max_sol_months integer;
  v_attorney_id uuid;
begin
  if not public.can_manage_incentives() then
    raise exception 'Not authorized to create incentives' using errcode = '42501';
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated user is required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Incentive title is required' using errcode = '22023';
  end if;

  if p_payout_amount is null or p_payout_amount <= 0 then
    raise exception 'Payout amount must be greater than 0' using errcode = '22023';
  end if;

  if p_target_type not in ('first_to_finish', 'milestone') then
    raise exception 'Invalid incentive target type' using errcode = '22023';
  end if;

  if p_target_quantity is null or p_target_quantity <= 0 then
    raise exception 'Target quantity must be greater than 0' using errcode = '22023';
  end if;

  if p_end_time is null or p_end_time <= now() then
    raise exception 'Expiration must be in the future' using errcode = '22023';
  end if;

  insert into public.incentives (
    title,
    description,
    payout_amount,
    target_type,
    target_quantity,
    end_time,
    creator_id,
    status
  )
  values (
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_payout_amount,
    p_target_type,
    p_target_quantity,
    p_end_time,
    auth.uid(),
    'pending'
  )
  returning id into v_incentive_id;

  for v_rule in
    select value
    from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
  loop
    v_state := upper(nullif(btrim(v_rule->>'state'), ''));
    v_max_sol_months := nullif(btrim(v_rule->>'max_sol_months'), '')::integer;
    v_attorney_id := nullif(btrim(v_rule->>'attorney_id'), '')::uuid;

    if v_state is not null or v_max_sol_months is not null or v_attorney_id is not null then
      insert into public.incentive_rules (
        incentive_id,
        state,
        max_sol_months,
        attorney_id
      )
      values (
        v_incentive_id,
        v_state,
        v_max_sol_months,
        v_attorney_id
      );
    end if;
  end loop;

  return v_incentive_id;
end;
$function$;

create or replace function public.record_incentives_for_qualified_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead record;
  v_bpo_id uuid;
  v_incentive record;
  v_event_id uuid;
  v_progress_id uuid;
  v_current_count integer;
  v_completed boolean;
  v_completed_now boolean;
  v_sol_months integer;
  v_result jsonb := '[]'::jsonb;
  v_qualified_at timestamp with time zone := now();
begin
  perform public.expire_incentives();

  select
    l.id,
    l.status,
    l.state,
    l.accident_date,
    l.assigned_attorney_id,
    l.lead_vendor,
    l.user_id
  into v_lead
  from public.leads l
  where l.id = p_lead_id
  for update;

  if not found or v_lead.status is distinct from 'qualified_payable' then
    return v_result;
  end if;

  v_bpo_id := public.resolve_incentive_bpo_owner(v_lead.lead_vendor, v_lead.user_id);
  if v_bpo_id is null then
    return v_result;
  end if;

  if v_lead.accident_date is not null then
    v_sol_months := greatest(
      0,
      (
        extract(year from age(v_qualified_at::date, v_lead.accident_date::date))::integer * 12
        + extract(month from age(v_qualified_at::date, v_lead.accident_date::date))::integer
      )
    );
  end if;

  for v_incentive in
    select i.id, i.title, i.target_quantity, i.target_type, i.payout_amount
    from public.incentives i
    where i.status = 'active'
      and i.end_time > v_qualified_at
      and (
        not exists (
          select 1
          from public.incentive_rules r
          where r.incentive_id = i.id
        )
        or exists (
          select 1
          from public.incentive_rules r
          where r.incentive_id = i.id
            and (r.state is null or lower(r.state) = lower(v_lead.state))
            and (r.max_sol_months is null or (v_sol_months is not null and v_sol_months <= r.max_sol_months))
            and (r.attorney_id is null or r.attorney_id = v_lead.assigned_attorney_id)
        )
      )
    order by i.created_at asc, i.id asc
  loop
    v_event_id := null;

    perform 1
    from public.incentives i
    where i.id = v_incentive.id
      and i.status = 'active'
      and i.end_time > v_qualified_at
    for update;

    if not found then
      continue;
    end if;

    if exists (
      select 1
      from public.bpo_incentive_progress p
      where p.incentive_id = v_incentive.id
        and p.bpo_id = v_bpo_id
        and p.is_completed = true
    ) then
      continue;
    end if;

    insert into public.incentive_progress_events (
      incentive_id,
      lead_id,
      bpo_id,
      sale_state,
      sol_months,
      attorney_id,
      qualified_at
    )
    values (
      v_incentive.id,
      v_lead.id,
      v_bpo_id,
      upper(nullif(v_lead.state, '')),
      v_sol_months,
      v_lead.assigned_attorney_id,
      v_qualified_at
    )
    on conflict (incentive_id, lead_id) do nothing
    returning id into v_event_id;

    if v_event_id is null then
      continue;
    end if;

    insert into public.bpo_incentive_progress (
      incentive_id,
      bpo_id,
      current_count
    )
    values (
      v_incentive.id,
      v_bpo_id,
      1
    )
    on conflict (incentive_id, bpo_id)
    do update set
      current_count = case
        when public.bpo_incentive_progress.is_completed then public.bpo_incentive_progress.current_count
        else public.bpo_incentive_progress.current_count + 1
      end,
      updated_at = now()
    returning id, current_count, is_completed
    into v_progress_id, v_current_count, v_completed;

    v_completed_now := (not coalesce(v_completed, false)) and v_current_count >= v_incentive.target_quantity;

    if v_completed_now then
      update public.bpo_incentive_progress
      set
        is_completed = true,
        completed_at = coalesce(completed_at, v_qualified_at),
        updated_at = now()
      where id = v_progress_id;

      insert into public.incentive_payouts (
        incentive_id,
        bpo_id,
        amount_paid
      )
      values (
        v_incentive.id,
        v_bpo_id,
        v_incentive.payout_amount
      )
      on conflict (incentive_id, bpo_id) do nothing;

      if v_incentive.target_type = 'first_to_finish' then
        update public.incentives
        set
          status = 'completed',
          updated_at = now()
        where id = v_incentive.id
          and status = 'active';
      end if;
    end if;

    v_result := v_result || jsonb_build_object(
      'incentive_id', v_incentive.id,
      'title', v_incentive.title,
      'bpo_id', v_bpo_id,
      'lead_id', v_lead.id,
      'current_count', v_current_count,
      'target_quantity', v_incentive.target_quantity,
      'is_completed', v_completed_now
    );
  end loop;

  return v_result;
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
declare
  v_incentive record;
  v_progress_id uuid;
  v_current_count integer;
  v_completed boolean;
  v_completed_now boolean;
  v_result jsonb := '[]'::jsonb;
begin
  if not (
    public.can_manage_incentives()
    or auth.role() = 'service_role'
  ) then
    raise exception 'Deprecated RPC is admin-only; qualified lead incentives are recorded from lead status transitions' using errcode = '42501';
  end if;

  perform public.expire_incentives();

  for v_incentive in
    select i.id, i.title, i.target_quantity, i.target_type, i.payout_amount
    from public.incentives i
    where i.status = 'active'
      and i.end_time > now()
      and (
        not exists (
          select 1 from public.incentive_rules r where r.incentive_id = i.id
        )
        or exists (
          select 1
          from public.incentive_rules r
          where r.incentive_id = i.id
            and (r.state is null or lower(r.state) = lower(p_state))
            and (r.max_sol_months is null or (p_sol_months is not null and p_sol_months <= r.max_sol_months))
            and (r.attorney_id is null or r.attorney_id = p_attorney_id)
        )
      )
    order by i.created_at asc, i.id asc
  loop
    perform 1
    from public.incentives i
    where i.id = v_incentive.id
      and i.status = 'active'
      and i.end_time > now()
    for update;

    if not found then
      continue;
    end if;

    if exists (
      select 1
      from public.bpo_incentive_progress p
      where p.incentive_id = v_incentive.id
        and p.bpo_id = p_bpo_id
        and p.is_completed = true
    ) then
      continue;
    end if;

    insert into public.bpo_incentive_progress (
      incentive_id,
      bpo_id,
      current_count
    )
    values (
      v_incentive.id,
      p_bpo_id,
      1
    )
    on conflict (incentive_id, bpo_id)
    do update set
      current_count = case
        when public.bpo_incentive_progress.is_completed then public.bpo_incentive_progress.current_count
        else public.bpo_incentive_progress.current_count + 1
      end,
      updated_at = now()
    returning id, current_count, is_completed
    into v_progress_id, v_current_count, v_completed;

    v_completed_now := (not coalesce(v_completed, false)) and v_current_count >= v_incentive.target_quantity;

    if v_completed_now then
      update public.bpo_incentive_progress
      set
        is_completed = true,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
      where id = v_progress_id;

      insert into public.incentive_payouts (
        incentive_id,
        bpo_id,
        amount_paid
      )
      values (
        v_incentive.id,
        p_bpo_id,
        v_incentive.payout_amount
      )
      on conflict (incentive_id, bpo_id) do nothing;

      if v_incentive.target_type = 'first_to_finish' then
        update public.incentives
        set
          status = 'completed',
          updated_at = now()
        where id = v_incentive.id
          and status = 'active';
      end if;
    end if;

    v_result := v_result || jsonb_build_object(
      'incentive_id', v_incentive.id,
      'title', v_incentive.title,
      'current_count', v_current_count,
      'target_quantity', v_incentive.target_quantity,
      'is_completed', v_completed_now
    );
  end loop;

  return v_result;
end;
$function$;

create or replace function public.handle_qualified_lead_incentives()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'qualified_payable'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.record_incentives_for_qualified_lead(new.id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_leads_record_qualified_incentives on public.leads;
create trigger trg_leads_record_qualified_incentives
after insert or update of status on public.leads
for each row
execute function public.handle_qualified_lead_incentives();

drop policy if exists bpo_incentive_progress_select on public.bpo_incentive_progress;
drop policy if exists bpo_incentive_progress_insert on public.bpo_incentive_progress;
drop policy if exists bpo_incentive_progress_update on public.bpo_incentive_progress;
drop policy if exists bpo_incentive_progress_delete on public.bpo_incentive_progress;
drop policy if exists bpo_incentive_progress_manage on public.bpo_incentive_progress;

create policy bpo_incentive_progress_select
  on public.bpo_incentive_progress
  for select
  to authenticated
  using (public.can_read_center_incentive_owner(bpo_id));

create policy bpo_incentive_progress_manage
  on public.bpo_incentive_progress
  for all
  to authenticated
  using (public.can_manage_incentives())
  with check (public.can_manage_incentives());

drop policy if exists incentive_payouts_select on public.incentive_payouts;
drop policy if exists incentive_payouts_manage on public.incentive_payouts;

create policy incentive_payouts_select
  on public.incentive_payouts
  for select
  to authenticated
  using (public.can_read_center_incentive_owner(bpo_id));

create policy incentive_payouts_manage
  on public.incentive_payouts
  for all
  to authenticated
  using (public.can_manage_incentives())
  with check (public.can_manage_incentives());

drop policy if exists incentive_progress_events_select on public.incentive_progress_events;
drop policy if exists incentive_progress_events_manage on public.incentive_progress_events;

create policy incentive_progress_events_select
  on public.incentive_progress_events
  for select
  to authenticated
  using (public.can_read_center_incentive_owner(bpo_id));

create policy incentive_progress_events_manage
  on public.incentive_progress_events
  for all
  to authenticated
  using (public.can_manage_incentives())
  with check (public.can_manage_incentives());

revoke execute on function public.check_incentive_for_sale(uuid, text, integer, uuid) from public, anon;
grant execute on function public.check_incentive_for_sale(uuid, text, integer, uuid) to authenticated, service_role;

revoke execute on function public.record_incentives_for_qualified_lead(uuid) from public, anon, authenticated;
grant execute on function public.record_incentives_for_qualified_lead(uuid) to service_role;

revoke execute on function public.handle_qualified_lead_incentives() from public, anon, authenticated;
