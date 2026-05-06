-- BPO onboarding board definitions and per-publisher stage positions.
-- The stages table stores the allowed columns/order. The user-stage table stores
-- where each publisher account currently sits on the board.

create table if not exists public.bpo_onboarding_portal_stages (
  id uuid not null default gen_random_uuid(),
  key text not null,
  label text not null,
  display_order integer not null,
  column_class text null,
  header_class text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint bpo_onboarding_portal_stages_pkey primary key (id),
  constraint bpo_onboarding_portal_stages_key_key unique (key),
  constraint bpo_onboarding_portal_stages_display_order_positive check ((display_order > 0)),
  constraint bpo_onboarding_portal_stages_key_not_blank check ((nullif(btrim(key), ''::text) is not null)),
  constraint bpo_onboarding_portal_stages_label_not_blank check ((nullif(btrim(label), ''::text) is not null))
);

create index if not exists idx_bpo_onboarding_portal_stages_display_order
  on public.bpo_onboarding_portal_stages using btree (display_order);

drop trigger if exists trg_bpo_onboarding_portal_stages_updated_at
  on public.bpo_onboarding_portal_stages;
create trigger trg_bpo_onboarding_portal_stages_updated_at
  before update on public.bpo_onboarding_portal_stages
  for each row execute function set_updated_at();

create table if not exists public.bpo_onboarding_portal_user_stages (
  user_id uuid not null,
  stage_key text not null,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  updated_by uuid null,
  constraint bpo_onboarding_portal_user_stages_pkey primary key (user_id),
  constraint bpo_onboarding_portal_user_stages_user_id_fkey
    foreign key (user_id) references public.app_users(user_id) on delete cascade,
  constraint bpo_onboarding_portal_user_stages_stage_key_fkey
    foreign key (stage_key) references public.bpo_onboarding_portal_stages(key) on update cascade,
  constraint bpo_onboarding_portal_user_stages_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null,
  constraint bpo_onboarding_portal_user_stages_stage_key_not_blank check ((nullif(btrim(stage_key), ''::text) is not null))
);

create index if not exists idx_bpo_onboarding_portal_user_stages_stage_key
  on public.bpo_onboarding_portal_user_stages using btree (stage_key, updated_at desc);

drop trigger if exists trg_bpo_onboarding_portal_user_stages_updated_at
  on public.bpo_onboarding_portal_user_stages;
create trigger trg_bpo_onboarding_portal_user_stages_updated_at
  before update on public.bpo_onboarding_portal_user_stages
  for each row execute function set_updated_at();

do $$
declare
  stage record;
begin
  for stage in
    select *
    from (
      values
        ('ready_to_move_forward', 'ready_to_move_forward', 'Ready to Move Forward', 1),
        ('retainer_sent_pending_signature', 'group_chat_created', 'Group Chat Created', 2),
        ('retainer_signed', 'logins_sent', 'Logins Sent', 3),
        ('scheduled_onboarding', 'scheduled_training', 'Scheduled Training', 4),
        ('onboarded_inactive_no_orders_yet', 'training_ran', 'Training Ran', 5),
        ('training_completed', 'training_completed', 'Training Completed', 6),
        ('active_actively_paying_placing_orders', 'active_bpo', 'Active BPO', 7),
        ('non_active_bpo', 'non_active_bpo', 'Non-Active BPO', 8)
    ) as stage_map(old_key, new_key, label, display_order)
  loop
    if stage.old_key <> stage.new_key
      and exists (select 1 from public.bpo_onboarding_portal_stages where key = stage.old_key)
      and exists (select 1 from public.bpo_onboarding_portal_stages where key = stage.new_key) then
      update public.bpo_onboarding_portal_user_stages
      set stage_key = stage.new_key
      where stage_key = stage.old_key;

      delete from public.bpo_onboarding_portal_stages
      where key = stage.old_key;
    elsif stage.old_key <> stage.new_key
      and exists (select 1 from public.bpo_onboarding_portal_stages where key = stage.old_key) then
      update public.bpo_onboarding_portal_stages
      set
        key = stage.new_key,
        label = stage.label,
        display_order = stage.display_order,
        is_active = true,
        updated_at = now()
      where key = stage.old_key;
    end if;
  end loop;
end;
$$;

insert into public.bpo_onboarding_portal_stages (key, label, display_order, column_class, header_class, is_active)
values
  ('ready_to_move_forward', 'Ready to Move Forward', 1, null, null, true),
  ('group_chat_created', 'Group Chat Created', 2, null, null, true),
  ('logins_sent', 'Logins Sent', 3, null, null, true),
  ('scheduled_training', 'Scheduled Training', 4, null, null, true),
  ('training_ran', 'Training Ran', 5, null, null, true),
  ('training_completed', 'Training Completed', 6, null, null, true),
  ('active_bpo', 'Active BPO', 7, null, null, true),
  ('non_active_bpo', 'Non-Active BPO', 8, null, null, true)
on conflict (key) do update
set
  label = excluded.label,
  display_order = excluded.display_order,
  column_class = coalesce(public.bpo_onboarding_portal_stages.column_class, excluded.column_class),
  header_class = coalesce(public.bpo_onboarding_portal_stages.header_class, excluded.header_class),
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.default_bpo_onboarding_portal_stage_key(account_status text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(account_status, '')) in ('inactive', 'disabled', 'banned', 'suspended')
      then 'non_active_bpo'
    when lower(coalesce(account_status, '')) in ('active', 'enabled', 'approved')
      then 'active_bpo'
    else 'ready_to_move_forward'
  end;
$$;

create or replace function public.ensure_bpo_onboarding_portal_user_role()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.app_users au
    where au.user_id = new.user_id
      and au.role in ('publisher_admin', 'publisher_closer')
  ) then
    raise exception 'BPO onboarding stages can only be assigned to publisher users';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bpo_onboarding_portal_user_role
  on public.bpo_onboarding_portal_user_stages;
create trigger trg_bpo_onboarding_portal_user_role
  before insert or update of user_id on public.bpo_onboarding_portal_user_stages
  for each row execute function public.ensure_bpo_onboarding_portal_user_role();

create or replace function public.ensure_bpo_onboarding_stage_for_publisher()
returns trigger
language plpgsql
as $$
begin
  if new.role in ('publisher_admin', 'publisher_closer') then
    insert into public.bpo_onboarding_portal_user_stages (user_id, stage_key)
    values (
      new.user_id,
      public.default_bpo_onboarding_portal_stage_key(new.account_status)
    )
    on conflict (user_id) do nothing;
  else
    delete from public.bpo_onboarding_portal_user_stages
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists app_users_ensure_bpo_onboarding_stage
  on public.app_users;
create trigger app_users_ensure_bpo_onboarding_stage
  after insert or update of role, account_status on public.app_users
  for each row execute function public.ensure_bpo_onboarding_stage_for_publisher();

create or replace function public.can_manage_bpo_onboarding_portal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.user_id = auth.uid()
      and (
        au.is_super_admin = true
        or au.role in ('super_admin', 'admin', 'accounts')
      )
  );
$$;

grant execute on function public.can_manage_bpo_onboarding_portal() to authenticated;

alter table public.bpo_onboarding_portal_stages enable row level security;
alter table public.bpo_onboarding_portal_user_stages enable row level security;

grant select, insert, update, delete on public.bpo_onboarding_portal_stages to authenticated;
grant select, insert, update, delete on public.bpo_onboarding_portal_user_stages to authenticated;

drop policy if exists bpo_onboarding_portal_stages_select
  on public.bpo_onboarding_portal_stages;
create policy bpo_onboarding_portal_stages_select
  on public.bpo_onboarding_portal_stages
  for select
  to authenticated
  using (public.can_manage_bpo_onboarding_portal());

drop policy if exists bpo_onboarding_portal_stages_manage
  on public.bpo_onboarding_portal_stages;
create policy bpo_onboarding_portal_stages_manage
  on public.bpo_onboarding_portal_stages
  for all
  to authenticated
  using (public.can_manage_bpo_onboarding_portal())
  with check (public.can_manage_bpo_onboarding_portal());

drop policy if exists bpo_onboarding_portal_user_stages_select
  on public.bpo_onboarding_portal_user_stages;
create policy bpo_onboarding_portal_user_stages_select
  on public.bpo_onboarding_portal_user_stages
  for select
  to authenticated
  using (public.can_manage_bpo_onboarding_portal());

drop policy if exists bpo_onboarding_portal_user_stages_manage
  on public.bpo_onboarding_portal_user_stages;
create policy bpo_onboarding_portal_user_stages_manage
  on public.bpo_onboarding_portal_user_stages
  for all
  to authenticated
  using (public.can_manage_bpo_onboarding_portal())
  with check (public.can_manage_bpo_onboarding_portal());

insert into public.bpo_onboarding_portal_user_stages (user_id, stage_key)
select
  au.user_id,
  public.default_bpo_onboarding_portal_stage_key(au.account_status) as stage_key
from public.app_users au
where au.role in ('publisher_admin', 'publisher_closer')
on conflict (user_id) do nothing;
