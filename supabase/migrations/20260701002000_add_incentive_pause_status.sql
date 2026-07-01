-- Add a paused lifecycle state for incentives/flash bonuses.
-- Paused incentives remain admin-visible, but publisher-facing queries and
-- matching logic continue to use only active incentives.

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
        'rejected'::text
      ]
    )
  );

create or replace function public.expire_incentives()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  expired_count integer;
begin
  update public.incentives
  set status = 'expired', updated_at = now()
  where status in ('active', 'paused')
    and end_time < now()
    and end_time is not null;

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$function$;
