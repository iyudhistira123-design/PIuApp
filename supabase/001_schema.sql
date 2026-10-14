-- PiwuApp cloud foundation. Apply on a NEW Supabase project, then run the
-- policy tests in docs/SECURITY.md with real user sessions before production.
-- This migration does NOT connect the local workspace to the cloud automatically.
begin;
create extension if not exists pgcrypto;
create table public.users (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '', avatar_url text, created_at timestamptz not null default now()
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 120), thumbnail text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.collaborators (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('Viewer','Editor')), created_at timestamptz not null default now(),
 primary key (project_id,user_id)
);
create index collaborators_user_idx on public.collaborators(user_id);
create index projects_owner_idx on public.projects(owner_id);
-- SECURITY DEFINER helpers avoid recursive policies on projects/collaborators.
-- Fixed search_path and fully qualified names prevent search_path injection.
create function public.owns_project(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p where p.id=pid and p.owner_id=(select auth.uid()));
$$;
create function public.can_read_project(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p where p.id=pid and p.owner_id=(select auth.uid()))
 or exists(select 1 from public.collaborators c where c.project_id=pid and c.user_id=(select auth.uid()));
$$;
create function public.can_edit_project(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects p where p.id=pid and p.owner_id=(select auth.uid()))
 or exists(select 1 from public.collaborators c where c.project_id=pid and c.user_id=(select auth.uid()) and c.role='Editor');
$$;
revoke all on function public.owns_project(uuid),public.can_read_project(uuid),public.can_edit_project(uuid) from public;
grant execute on function public.owns_project(uuid),public.can_read_project(uuid),public.can_edit_project(uuid) to authenticated;
create table public.project_files (
 project_id uuid not null references public.projects(id) on delete cascade, path text not null check (path !~ '(^/|(^|/)\.\.(\/|$)|(^|/)\.env)'),
 content text not null default '', updated_at timestamptz not null default now(), primary key(project_id,path)
);
create table public.messages (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 role text not null check (role in ('user','assistant')), content text not null, reasoning jsonb not null default '[]',
 attachments jsonb not null default '[]', mode text not null check (mode in ('Builder','Plan','Ask')),
 model text not null default 'Otomatis', created_at timestamptz not null default now()
);
comment on column public.messages.reasoning is 'Concise user-visible implementation summary only; never private chain-of-thought.';
create table public.plans (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 content text not null, status text not null default 'draft' check(status in ('draft','approved','running','done','error')),
 tasks jsonb not null default '[]', created_at timestamptz not null default now()
);
create table public.versions (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 snapshot jsonb not null, message_id uuid references public.messages(id) on delete set null, created_at timestamptz not null default now()
);
create table public.project_memory (
 project_id uuid primary key references public.projects(id) on delete cascade, content text not null default '', updated_at timestamptz not null default now()
);
create table public.prompts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null, content text not null, tags text[] not null default '{}', visibility text not null default 'private' check(visibility in('private','public'))
);
create table public.model_settings (user_id uuid primary key references auth.users(id) on delete cascade, default_model text not null default 'Otomatis');
create table public.comments (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 element_selector text, body text not null, status text not null default 'open' check(status in('open','resolved')),
 author_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.session_recordings (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 events jsonb not null default '[]', created_at timestamptz not null default now()
);
create table public.env_vars (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 key text not null, encrypted_value bytea not null, environment text not null check(environment in('dev','production')),
 unique(project_id,key,environment)
);
comment on table public.env_vars is 'Backend-only. Encrypt/decrypt with external KMS envelope encryption. No browser SELECT or direct client write policy.';
create table public.deployments (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 url text, status text not null default 'pending', created_at timestamptz not null default now()
);
create table public.analytics_events (
 id bigint generated always as identity primary key, project_id uuid not null references public.projects(id) on delete cascade,
 path text not null, referrer text, device text, created_at timestamptz not null default now()
);
create table public.templates (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), project_snapshot jsonb not null,
 price integer not null default 0 check(price>=0), status text not null default 'draft' check(status in('draft','published','archived'))
);
create table public.referrals (
 id uuid primary key default gen_random_uuid(), referrer_id uuid not null references auth.users(id), referred_id uuid unique not null references auth.users(id),
 reward_status text not null default 'pending', check(referrer_id<>referred_id)
);
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 plan text not null check(plan in('Free','Pro','Team')), provider text, status text not null, created_at timestamptz not null default now()
);
create table public.scan_reports (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 type text not null, score integer check(score between 0 and 100), findings jsonb not null default '[]', created_at timestamptz not null default now()
);
create table public.usage (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 credits_used integer not null default 0 check(credits_used>=0), created_at timestamptz not null default now()
);
-- Explicitly enable RLS on EVERY application table.
do $$ declare t text; begin
 foreach t in array array['users','projects','project_files','messages','plans','versions','project_memory','collaborators','prompts','model_settings','comments','session_recordings','env_vars','deployments','analytics_events','templates','referrals','subscriptions','scan_reports','usage'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon',t);
 end loop;
end $$;
create policy users_read on public.users for select to authenticated using(id=(select auth.uid()));
create policy users_create on public.users for insert to authenticated with check(id=(select auth.uid()));
create policy users_update on public.users for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy projects_read on public.projects for select to authenticated using(public.can_read_project(id));
create policy projects_create on public.projects for insert to authenticated with check(owner_id=(select auth.uid()));
create policy projects_update on public.projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy projects_delete on public.projects for delete to authenticated using(owner_id=(select auth.uid()));
create policy collaborators_read on public.collaborators for select to authenticated using(public.can_read_project(project_id));
create policy collaborators_create on public.collaborators for insert to authenticated with check(public.owns_project(project_id));
create policy collaborators_update on public.collaborators for update to authenticated using(public.owns_project(project_id)) with check(public.owns_project(project_id));
create policy collaborators_delete on public.collaborators for delete to authenticated using(public.owns_project(project_id));
-- Project content: viewers read only, owners/editors write.
do $$ declare t text; begin
 foreach t in array array['project_files','plans','project_memory','session_recordings'] loop
 execute format('create policy content_read on public.%I for select to authenticated using(public.can_read_project(project_id))',t);
 execute format('create policy content_insert on public.%I for insert to authenticated with check(public.can_edit_project(project_id))',t);
 execute format('create policy content_update on public.%I for update to authenticated using(public.can_edit_project(project_id)) with check(public.can_edit_project(project_id))',t);
 execute format('create policy content_delete on public.%I for delete to authenticated using(public.can_edit_project(project_id))',t);
 end loop;
end $$;
-- Versions append-only to preserve audit history.
create policy versions_read on public.versions for select to authenticated using(public.can_read_project(project_id));
create policy versions_create on public.versions for insert to authenticated with check(public.can_edit_project(project_id));
create policy messages_read on public.messages for select to authenticated using(public.can_read_project(project_id));
create policy messages_send on public.messages for insert to authenticated with check(public.can_edit_project(project_id) and role='user');
-- Assistant messages must be persisted by the backend after authorization.
create policy comments_read on public.comments for select to authenticated using(public.can_read_project(project_id));
create policy comments_insert on public.comments for insert to authenticated with check(public.can_read_project(project_id) and author_id=(select auth.uid()));
create policy comments_update on public.comments for update to authenticated using(public.can_read_project(project_id) and author_id=(select auth.uid())) with check(public.can_read_project(project_id) and author_id=(select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated using(public.can_read_project(project_id) and (author_id=(select auth.uid()) or public.owns_project(project_id)));
create policy prompts_read on public.prompts for select to authenticated using(owner_id=(select auth.uid()) or visibility='public');
create policy prompts_own on public.prompts for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy model_own on public.model_settings for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy templates_read on public.templates for select to authenticated using(owner_id=(select auth.uid()) or (status='published' and price=0));
create policy templates_own on public.templates for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
-- Financial and deployment state may ONLY be written by trusted backend workers.
create policy referrals_read on public.referrals for select to authenticated using(referrer_id=(select auth.uid()) or referred_id=(select auth.uid()));
create policy subscriptions_read on public.subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy usage_read on public.usage for select to authenticated using(user_id=(select auth.uid()));
do $$ declare t text; begin
 foreach t in array array['deployments','analytics_events','scan_reports'] loop
 execute format('create policy reports_read on public.%I for select to authenticated using(public.can_read_project(project_id))',t);
 end loop;
end $$;
-- Defense in depth: env ciphertext never accessible via authenticated PostgREST.
revoke all on public.env_vars from authenticated,anon;
-- Private assets. Each object path MUST begin with its project UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('project-assets','project-assets',false,10485760,array['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf','text/plain'])
 on conflict(id) do nothing;
create policy assets_read on storage.objects for select to authenticated using(bucket_id='project-assets' and public.can_read_project((storage.foldername(name))[1]::uuid));
create policy assets_insert on storage.objects for insert to authenticated with check(bucket_id='project-assets' and public.can_edit_project((storage.foldername(name))[1]::uuid));
create policy assets_update on storage.objects for update to authenticated using(bucket_id='project-assets' and public.can_edit_project((storage.foldername(name))[1]::uuid)) with check(bucket_id='project-assets' and public.can_edit_project((storage.foldername(name))[1]::uuid));
create policy assets_delete on storage.objects for delete to authenticated using(bucket_id='project-assets' and public.can_edit_project((storage.foldername(name))[1]::uuid));
commit;
