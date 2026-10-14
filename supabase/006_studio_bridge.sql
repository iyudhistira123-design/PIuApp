-- Apply once after 005_admin.sql. Server-only bridge credentials and inbox.
begin;
create table public.studio_bridges (
 project_id uuid primary key references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 token_hash text unique not null,
 expires_at timestamptz not null,
 snapshot jsonb,
 snapshot_id uuid,
 bundle jsonb,
 bundle_id uuid,
 state text not null default 'idle' check(state in ('idle','queued','applying','applied','failed')),
 receipt jsonb,
 updated_at timestamptz not null default now()
);
alter table public.studio_bridges enable row level security;
revoke all on public.studio_bridges from public,anon,authenticated;
grant all on public.studio_bridges to service_role;
comment on table public.studio_bridges is 'Short-lived scoped plugin tokens (SHA256 only). Server rechecks project membership and platform controls on every request. Never store a Supabase key inside a Studio plugin.';
commit;
