-- Shared runtime admission controls. Apply after 001–006. No browser access.
begin;
create table if not exists public.runtime_rate_buckets (
  key text primary key, hits integer not null, expires_at timestamptz not null
);
create index if not exists runtime_rate_expiry on public.runtime_rate_buckets(expires_at);
create table if not exists public.runtime_sandbox_slots (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner uuid not null,
  expires_at timestamptz not null,
  primary key(user_id,project_id)
);
alter table public.runtime_rate_buckets enable row level security;
alter table public.runtime_sandbox_slots enable row level security;
revoke all on public.runtime_rate_buckets, public.runtime_sandbox_slots from public, anon, authenticated;
grant select,insert,update,delete on public.runtime_rate_buckets, public.runtime_sandbox_slots to service_role;

create or replace function public.piwu_take_rate(p_key text,p_max integer,p_window_ms integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer; expiry timestamptz; t timestamptz:=clock_timestamp();
begin
  if length(p_key)<>64 or p_key !~ '^[0-9a-f]+$' or p_max not between 1 and 1000 or p_window_ms not between 1000 and 3600000 then
    raise exception 'RUNTIME_INVALID';
  end if;
  -- Fixed windows start on first request; row upsert locks serialize all replicas.
  insert into runtime_rate_buckets(key,hits,expires_at) values(p_key,1,t+make_interval(secs=>p_window_ms/1000.0))
  on conflict(key) do update set
    hits=case when runtime_rate_buckets.expires_at<=t then 1 else least(runtime_rate_buckets.hits+1,p_max+1) end,
    expires_at=case when runtime_rate_buckets.expires_at<=t then excluded.expires_at else runtime_rate_buckets.expires_at end
  returning hits,expires_at into n,expiry;
  -- Bounded opportunistic cleanup; expired rows never participate in a new window.
  delete from runtime_rate_buckets where key in (select key from runtime_rate_buckets where expires_at<t limit 100 for update skip locked);
  return jsonb_build_object('allowed',n<=p_max,'remaining',greatest(0,p_max-n),'retryAfter',greatest(1,ceil(extract(epoch from expiry-t))));
end $$;

create or replace function public.piwu_sandbox_slot(p_user uuid,p_project uuid,p_owner uuid,p_release boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare slot runtime_sandbox_slots; t timestamptz:=clock_timestamp();
begin
  if p_user is null or p_project is null or p_owner is null or p_release is null then raise exception 'RUNTIME_INVALID'; end if;
  -- Serialize quota admission, including different project IDs on different replicas.
  perform pg_advisory_xact_lock(71007,1);
  delete from runtime_sandbox_slots where expires_at<=t;
  if p_release then
    delete from runtime_sandbox_slots where user_id=p_user and project_id=p_project and owner=p_owner;
    return jsonb_build_object('allowed',true);
  end if;
  select * into slot from runtime_sandbox_slots where user_id=p_user and project_id=p_project;
  if found then
    return jsonb_build_object('allowed',slot.owner=p_owner,'code','SANDBOX_AFFINITY');
  end if;
  if (select count(*) from runtime_sandbox_slots)>=50 or (select count(*) from runtime_sandbox_slots where user_id=p_user)>=2 then
    return jsonb_build_object('allowed',false,'code','SANDBOX_QUOTA');
  end if;
  -- No heartbeat/extension: lease outlasts the E2B hard 10-minute lifetime + creation margin.
  insert into runtime_sandbox_slots values(p_user,p_project,p_owner,t+interval '20 minutes');
  return jsonb_build_object('allowed',true);
end $$;
revoke all on function public.piwu_take_rate(text,integer,integer) from public,anon,authenticated;
revoke all on function public.piwu_sandbox_slot(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.piwu_take_rate(text,integer,integer) to service_role;
grant execute on function public.piwu_sandbox_slot(uuid,uuid,uuid,boolean) to service_role;
commit;
