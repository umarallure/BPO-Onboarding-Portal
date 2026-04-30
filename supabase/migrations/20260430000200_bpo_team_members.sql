create table if not exists public.bpo_team_members (
  id uuid not null default gen_random_uuid(),
  center_id uuid not null,
  user_id uuid null,                          -- auth user (null when no portal account)
  full_name text not null,
  email text not null,
  phone text null,
  position text not null default 'intake_team',
  position_other text null,
  shift_availability text not null default 'full_day',
  state text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bpo_team_members_pkey primary key (id),
  constraint bpo_team_members_center_id_fkey
    foreign key (center_id) references public.centers(id) on delete cascade,
  constraint bpo_team_members_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null,
  constraint bpo_team_members_position_check check (
    position = any (array['accounting','marketing','invoicing','intake_team','other'])
  ),
  constraint bpo_team_members_position_other_valid check (
    (position = 'other' and nullif(btrim(position_other), '') is not null)
    or (position <> 'other' and position_other is null)
  ),
  constraint bpo_team_members_shift_check check (
    shift_availability = any (array['morning','afternoon','evening','full_day'])
  ),
  constraint bpo_team_members_state_check check (
    state is null or state = any (array[
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
      'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
      'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
      'VA','WA','WV','WI','WY'
    ])
  )
);

-- One BPO row per portal user (when set) so the closer/admin link is unambiguous.
create unique index if not exists uniq_bpo_team_members_user_id
  on public.bpo_team_members (user_id)
  where user_id is not null;

-- The hot read path is "list every member of this center, newest first".
create index if not exists idx_bpo_team_members_center_id_created_at
  on public.bpo_team_members (center_id, created_at desc);

-- Reuse the shared updated_at trigger (already defined for `bpo_profiles`,
-- `app_users`, etc.).
drop trigger if exists trg_bpo_team_members_updated_at on public.bpo_team_members;
create trigger trg_bpo_team_members_updated_at
  before update on public.bpo_team_members
  for each row execute function set_updated_at();
