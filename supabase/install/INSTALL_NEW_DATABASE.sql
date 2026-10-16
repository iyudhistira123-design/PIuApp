-- PIWUAPP: INSTALL BARU SAJA (001–010)
-- Dibuat oleh npm run sql:bundle dari migration kanonis; jangan edit hasil ini manual.
-- Jalankan SELURUH file di SQL Editor project Supabase baru sebagai operator database.
-- BUKAN untuk database yang pernah menerima migration PiwuApp.
-- Tidak membuat akun Auth, password, admin, pembayaran, atau kredensial provider.
-- Semua perubahan berada dalam satu transaksi: kegagalan membatalkan instalasi.
begin;
select pg_advisory_xact_lock(71008,1);
do $piwu_preflight$
begin
  if to_regclass('auth.users') is null or to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise exception 'PIWU_SUPABASE_REQUIRED: gunakan project Supabase dengan Auth dan Storage tersedia';
  end if;
  if exists (select 1 from unnest(array['public.users','public.projects','public.collaborators','public.project_files','public.messages','public.plans','public.versions','public.project_memory','public.prompts','public.model_settings','public.comments','public.session_recordings','public.env_vars','public.deployments','public.analytics_events','public.templates','public.referrals','public.subscriptions','public.scan_reports','public.usage','public.project_workspaces','public.project_invites','public.credit_accounts','public.credit_ledger','public.credit_reservations','public.payment_orders','public.webhook_receipts','public.referral_codes','public.template_entitlements','public.marketplace_sales','public.project_sites','public.publish_jobs','public.recording_shares','public.asset_records','public.hosting_cleanup_jobs','public.project_datasets','public.platform_admins','public.platform_user_controls','public.platform_project_controls','public.site_configuration','public.platform_broadcasts','public.broadcast_reads','public.platform_audit','public.studio_bridges','public.runtime_rate_buckets','public.runtime_sandbox_slots','public.runtime_search_cache','public.credit_lots']) as candidate(name) where to_regclass(name) is not null) then
    raise exception 'PIWU_EXISTING_DATABASE: objek PiwuApp sudah ada. Jangan jalankan installer baru; periksa CHECK_INSTALLATION.sql dan jalankan hanya migration yang belum diterapkan.';
  end if;
  if exists(select 1 from storage.buckets where id='project-assets') then
    raise exception 'PIWU_EXISTING_BUCKET: bucket project-assets sudah ada; tinjau database lama sebelum instalasi';
  end if;
end $piwu_preflight$;

-- =====================================================================
-- 001_schema.sql | SHA256 42699150d5d41570771cbd89fb7430516f5179fc7daef6a425f32c028e86271d
-- =====================================================================
-- PiwuApp cloud foundation. Apply on a NEW Supabase project, then run the
-- policy tests in docs/SECURITY.md with real user sessions before production.
-- This migration does NOT connect the local workspace to the cloud automatically.
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

-- =====================================================================
-- 002_workspace_sync.sql | SHA256 2531c53ee6523af637bb87c50e6b974676e7c2c54521c17204aeabe5d430f3b1
-- =====================================================================
-- Apply after 001_schema.sql. Atomic workspace snapshots with optimistic locks.
-- Cloud notebooks are user-editable state, NOT trusted assistant/audit records.
create table public.project_workspaces (
 project_id uuid primary key references public.projects(id) on delete cascade,
 revision bigint not null default 1 check(revision>0),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
alter table public.project_workspaces enable row level security;
revoke all on public.project_workspaces from public,anon,authenticated;
grant select on public.project_workspaces to authenticated;
create policy workspace_read on public.project_workspaces for select to authenticated using(public.can_read_project(project_id));
-- These records must share a revision. Prevent clients bypassing the RPC lock.
revoke insert,update,delete on public.projects,public.project_files,public.project_memory from authenticated,anon;
grant select on public.projects,public.project_files,public.project_memory to authenticated;

create function public.piwu_list_workspaces()
returns table(payload jsonb,revision bigint,owner_id uuid,access_role text,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 select w.payload,w.revision,p.owner_id,
  case when p.owner_id=(select auth.uid()) then 'Owner' else c.role end,
  w.updated_at
 from public.project_workspaces w join public.projects p on p.id=w.project_id
 left join public.collaborators c on c.project_id=p.id and c.user_id=(select auth.uid())
 where (select auth.uid()) is not null and (p.owner_id=(select auth.uid()) or c.user_id=(select auth.uid()))
 order by w.updated_at desc;
$$;

create function public.piwu_save_workspace(p_id uuid,p_payload jsonb,p_expected_revision bigint)
returns table(payload jsonb,revision bigint,owner_id uuid,access_role text,updated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=(select auth.uid());
 current_owner uuid;
 current_revision bigint;
 actor_role text;
 pair record;
 saved public.project_workspaces%rowtype;
begin
 if actor is null then raise exception 'PIWU_AUTH' using errcode='28000';end if;
 if p_id is null or p_payload is null or p_expected_revision is null or p_expected_revision<0
  or jsonb_typeof(p_payload) is distinct from 'object'
  or p_payload->>'id' is distinct from p_id::text
  or jsonb_typeof(p_payload->'name') is distinct from 'string'
  or length(trim(p_payload->>'name')) not between 1 and 120
  or jsonb_typeof(p_payload->'files') is distinct from 'object'
  or jsonb_typeof(p_payload->'messages') is distinct from 'array'
  or jsonb_typeof(p_payload->'versions') is distinct from 'array'
  or jsonb_typeof(p_payload->'comments') is distinct from 'array'
  or jsonb_typeof(p_payload->'createdAt') is distinct from 'number'
  or jsonb_typeof(p_payload->'updatedAt') is distinct from 'number'
  or octet_length(p_payload::text)>8388608
 then raise exception 'PIWU_INVALID';end if;
 if jsonb_array_length(p_payload->'versions')>50 or (select count(*) from jsonb_object_keys(p_payload->'files'))>200 then raise exception 'PIWU_INVALID';end if;
 for pair in select key,value from jsonb_each(p_payload->'files') loop
  if length(pair.key)=0 or length(pair.key)>240 or pair.key ~ E'(^/|(^|/)\\.\\.(/|$)|(^|/)\\.env($|[./]))' or position(E'\\' in pair.key)>0
   or jsonb_typeof(pair.value) is distinct from 'string' or octet_length(pair.value::text)>262144
  then raise exception 'PIWU_INVALID';end if;
 end loop;
 -- Heuristic protection, not a full secret scanner. Inspect historical snapshots too.
 if p_payload::text ~ '(sk-[A-Za-z0-9]{20,}|-----BEGIN[ A-Z]*PRIVATE KEY-----)' then raise exception 'PIWU_INVALID';end if;
 select p.owner_id into current_owner from public.projects p where p.id=p_id for update;
 if not found then
  if p_expected_revision<>0 then raise exception 'PIWU_CONFLICT';end if;
  insert into public.projects(id,owner_id,name) values(p_id,actor,p_payload->>'name');
  current_owner:=actor;actor_role:='Owner';
 else
  if current_owner=actor then actor_role:='Owner';
  else select c.role into actor_role from public.collaborators c where c.project_id=p_id and c.user_id=actor;end if;
  if actor_role is null or actor_role='Viewer' then raise exception 'PIWU_PERMISSION' using errcode='42501';end if;
 end if;
 select w.revision into current_revision from public.project_workspaces w where w.project_id=p_id for update;
 if coalesce(current_revision,0)<>p_expected_revision then raise exception 'PIWU_CONFLICT';end if;
 insert into public.project_workspaces(project_id,revision,payload,updated_by)
 values(p_id,1,p_payload,actor)
 on conflict(project_id) do update set revision=public.project_workspaces.revision+1,payload=excluded.payload,updated_by=actor,updated_at=now()
 returning * into saved;
 update public.projects set name=p_payload->>'name',updated_at=now() where id=p_id;
 -- File explorer + memory stay in the same database transaction as the notebook.
 delete from public.project_files where project_id=p_id;
 insert into public.project_files(project_id,path,content) select p_id,key,value from jsonb_each_text(p_payload->'files');
 insert into public.project_memory(project_id,content) values(p_id,coalesce(p_payload->'files'->>'PIWU.md',''))
 on conflict(project_id) do update set content=excluded.content,updated_at=now();
 return query select saved.payload,saved.revision,current_owner,actor_role,saved.updated_at;
end;
$$;

create function public.piwu_delete_workspace(p_id uuid,p_expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare current_owner uuid;current_revision bigint;
begin
 if (select auth.uid()) is null then raise exception 'PIWU_AUTH' using errcode='28000';end if;
 if p_expected_revision is null or p_expected_revision<0 then raise exception 'PIWU_INVALID';end if;
 select p.owner_id into current_owner from public.projects p where p.id=p_id for update;
 if not found then return;end if;
 if current_owner<>(select auth.uid()) then raise exception 'PIWU_PERMISSION' using errcode='42501';end if;
 select w.revision into current_revision from public.project_workspaces w where w.project_id=p_id for update;
 if coalesce(current_revision,0)<>p_expected_revision then raise exception 'PIWU_CONFLICT';end if;
 delete from public.projects where id=p_id;
end;
$$;
revoke all on function public.piwu_list_workspaces(),public.piwu_save_workspace(uuid,jsonb,bigint),public.piwu_delete_workspace(uuid,bigint) from public,anon;
grant execute on function public.piwu_list_workspaces(),public.piwu_save_workspace(uuid,jsonb,bigint),public.piwu_delete_workspace(uuid,bigint) to authenticated;
comment on table public.project_workspaces is 'User-editable IDE notebook. Do not trust embedded messages/comments as verified identities or use this data as an authorization source. Project access is determined exclusively from projects.owner_id and collaborators.';

-- =====================================================================
-- 003_services.sql | SHA256 0839d41a2a7b6aadf3d0e0772aa27449951fa79969782a124eba04024f977b94
-- =====================================================================
-- Apply after 001 and 002. All service mutations require the backend service role.
-- Never expose the service-role key in a VITE_* variable or browser bundle.
create table public.project_invites (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid not null references auth.users(id), email text, role text not null check(role in('Viewer','Editor')),
 token_hash text unique not null, expires_at timestamptz not null, accepted_by uuid references auth.users(id),
 accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.credit_accounts (user_id uuid primary key references auth.users(id) on delete cascade,balance integer not null default 0,created_at timestamptz not null default now());
create table public.credit_ledger (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 delta integer not null, reason text not null, reference text not null, created_at timestamptz not null default now(),unique(user_id,reference)
);
create table public.credit_reservations (
 id uuid primary key, user_id uuid not null references auth.users(id), amount integer not null check(amount>0),
 purpose text not null check(purpose in('ai','sandbox','publish')),status text not null default 'reserved' check(status in('reserved','settled','refunded')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.payment_orders (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),provider text not null check(provider in('midtrans','xendit')),
 kind text not null check(kind in('plan','topup','template')),sku text not null,amount integer not null check(amount>0),currency text not null default 'IDR' check(currency='IDR'),
 credits integer not null default 0 check(credits>=0),plan text check(plan in('Pro','Team')),template_id uuid references public.templates(id),
 status text not null default 'created',provider_id text,checkout_url text,fulfilled_at timestamptz,refunded_at timestamptz,created_at timestamptz not null default now()
);
create table public.webhook_receipts (provider text not null,event_id text not null,body_hash text not null,status text not null default 'processing',attempts integer not null default 1,updated_at timestamptz not null default now(),primary key(provider,event_id));
create table public.referral_codes (user_id uuid primary key references auth.users(id),code text unique not null default replace(gen_random_uuid()::text,'-',''));
create table public.template_entitlements (user_id uuid not null references auth.users(id),template_id uuid not null references public.templates(id),order_id uuid not null references public.payment_orders(id),created_at timestamptz not null default now(),primary key(user_id,template_id));
create table public.marketplace_sales (order_id uuid primary key references public.payment_orders(id),seller_id uuid not null references auth.users(id),buyer_id uuid not null references auth.users(id),gross integer not null,platform_fee integer not null,net integer not null,status text not null default 'accrued',created_at timestamptz not null default now());
create table public.project_sites (project_id uuid primary key references public.projects(id) on delete cascade,provider text not null default 'netlify',provider_site_id text unique not null,url text not null,custom_domain text,domain_status text,updated_at timestamptz not null default now());
create table public.publish_jobs (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,user_id uuid not null references auth.users(id),
 snapshot jsonb not null,revision bigint not null,status text not null default 'queued' check(status in('queued','building','ready','failed')),
 attempts integer not null default 0,lease_until timestamptz,error text,deployment_id uuid references public.deployments(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.recording_shares (id uuid primary key default gen_random_uuid(),recording_id uuid not null references public.session_recordings(id) on delete cascade,created_by uuid not null references auth.users(id),token_hash text unique not null,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now());
create table public.asset_records (id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,path text not null,mime text not null,size_bytes integer not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
alter table public.deployments add column provider_deploy_id text,add column revision bigint,add column error text;
alter table public.referrals add column reward_order_id uuid references public.payment_orders(id);
alter table public.subscriptions add column current_period_start timestamptz not null default now(),add column current_period_end timestamptz,add column order_id uuid references public.payment_orders(id);
alter table public.templates add column title text not null default 'Template',add column description text not null default '',add column category text not null default 'Website',add column preview_url text,add column created_at timestamptz not null default now();
alter table public.analytics_events add column visitor_hash text;
alter table public.session_recordings add column title text not null default 'Rekaman sesi';
create index credit_ledger_user_date on public.credit_ledger(user_id,created_at desc);
create index analytics_project_date on public.analytics_events(project_id,created_at desc);
create unique index publish_one_active_job on public.publish_jobs(project_id) where status in('queued','building');
create index publish_jobs_queue on public.publish_jobs(status,created_at);
-- Prevent publishing/altering snapshots/prices without server validation.
revoke insert,update,delete on public.templates,public.session_recordings from authenticated,anon;

do $$ declare t text;begin
 foreach t in array array['project_invites','credit_accounts','credit_ledger','credit_reservations','payment_orders','webhook_receipts','referral_codes','template_entitlements','marketplace_sales','project_sites','publish_jobs','recording_shares','asset_records'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.credit_accounts,public.credit_ledger,public.payment_orders,public.referral_codes,public.template_entitlements,public.marketplace_sales,public.project_sites,public.publish_jobs,public.asset_records to authenticated;
create policy credit_account_read on public.credit_accounts for select to authenticated using(user_id=(select auth.uid()));
create policy credit_ledger_read on public.credit_ledger for select to authenticated using(user_id=(select auth.uid()));
create policy orders_read on public.payment_orders for select to authenticated using(user_id=(select auth.uid()));
create policy codes_read on public.referral_codes for select to authenticated using(user_id=(select auth.uid()));
create policy entitlements_read on public.template_entitlements for select to authenticated using(user_id=(select auth.uid()));
create policy sales_read on public.marketplace_sales for select to authenticated using(seller_id=(select auth.uid()));
create policy sites_read on public.project_sites for select to authenticated using(public.can_read_project(project_id));
create policy jobs_read on public.publish_jobs for select to authenticated using(public.can_read_project(project_id));
create policy assets_metadata_read on public.asset_records for select to authenticated using(public.can_read_project(project_id));

create function public.piwu_ensure_credits(p_user uuid) returns integer language plpgsql security definer set search_path='' as $$
declare result integer;begin
 insert into public.credit_accounts(user_id,balance) values(p_user,30) on conflict do nothing;
 if found then insert into public.credit_ledger(user_id,delta,reason,reference) values(p_user,30,'Kredit awal','welcome');end if;
 select balance into result from public.credit_accounts where user_id=p_user;return result;
end;$$;
create function public.piwu_reserve_credits(p_user uuid,p_id uuid,p_amount integer,p_purpose text) returns integer language plpgsql security definer set search_path='' as $$
declare available integer;begin
 if p_amount is null or p_amount<1 or p_amount>1000 or p_id is null then raise exception 'PIWU_INVALID';end if;
 perform public.piwu_ensure_credits(p_user);
 select balance into available from public.credit_accounts where user_id=p_user for update;
 if exists(select 1 from public.credit_reservations where id=p_id) then raise exception 'PIWU_DUPLICATE';end if;
 if available<p_amount then raise exception 'PIWU_CREDITS';end if;
 if (select count(*) from public.credit_reservations where user_id=p_user and created_at>now()-interval '1 hour')>=120 then raise exception 'PIWU_RATE';end if;
 insert into public.credit_reservations(id,user_id,amount,purpose) values(p_id,p_user,p_amount,p_purpose);
 update public.credit_accounts set balance=balance-p_amount where user_id=p_user;
 insert into public.credit_ledger(user_id,delta,reason,reference) values(p_user,-p_amount,p_purpose,'reserve:'||p_id);
 return available-p_amount;
end;$$;
create function public.piwu_finish_credits(p_id uuid,p_success boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.credit_reservations%rowtype;begin
 select * into r from public.credit_reservations where id=p_id for update;
 if not found or r.status<>'reserved' then return;end if;
 if p_success then update public.credit_reservations set status='settled',updated_at=now() where id=p_id;
 else
 update public.credit_accounts set balance=balance+r.amount where user_id=r.user_id;
 insert into public.credit_ledger(user_id,delta,reason,reference) values(r.user_id,r.amount,'Pengembalian proses gagal','refund:'||p_id) on conflict do nothing;
 update public.credit_reservations set status='refunded',updated_at=now() where id=p_id;
 end if;
end;$$;
create function public.piwu_apply_payment(p_id uuid,p_amount integer,p_currency text,p_state text) returns text language plpgsql security definer set search_path='' as $$
declare o public.payment_orders%rowtype;ref public.referrals%rowtype;seller uuid;period_end timestamptz;cancelled_start timestamptz;cancelled_end timestamptz;unused interval;begin
 select * into o from public.payment_orders where id=p_id for update;
 if not found or p_amount is null or o.amount<>p_amount or o.currency is distinct from p_currency then raise exception 'PIWU_PAYMENT_MISMATCH';end if;
 if p_state='paid' then
 if o.refunded_at is not null then return 'refunded';end if;
 if o.fulfilled_at is not null then return 'already_paid';end if;
 perform public.piwu_ensure_credits(o.user_id);
 if o.credits>0 then
 update public.credit_accounts set balance=balance+o.credits where user_id=o.user_id;
 insert into public.credit_ledger(user_id,delta,reason,reference) values(o.user_id,o.credits,'Pembayaran terverifikasi','payment:'||o.id);
 end if;
 if o.kind='plan' then
 select greatest(now(),coalesce(max(current_period_end),now()))+interval '30 days' into period_end from public.subscriptions where user_id=o.user_id and status='active';
 insert into public.subscriptions(user_id,plan,provider,status,current_period_start,current_period_end,order_id) values(o.user_id,o.plan,o.provider,'active',period_end-interval '30 days',period_end,o.id);
 elsif o.kind='template' then
 select owner_id into seller from public.templates where id=o.template_id;
 insert into public.template_entitlements(user_id,template_id,order_id) values(o.user_id,o.template_id,o.id) on conflict do nothing;
 insert into public.marketplace_sales(order_id,seller_id,buyer_id,gross,platform_fee,net) values(o.id,seller,o.user_id,o.amount,(o.amount*0.2)::integer,o.amount-(o.amount*0.2)::integer);
 end if;
 update public.payment_orders set status='paid',fulfilled_at=now() where id=o.id;
 select * into ref from public.referrals where referred_id=o.user_id and reward_status='pending' and o.kind in('plan','topup') and o.amount>=49000 for update;
 if found then
 perform public.piwu_ensure_credits(ref.referrer_id);
 update public.credit_accounts set balance=balance+50 where user_id in(ref.referrer_id,ref.referred_id);
 insert into public.credit_ledger(user_id,delta,reason,reference) values(ref.referrer_id,50,'Bonus referral','referral:'||ref.id),(ref.referred_id,50,'Bonus referral','referral:'||ref.id);
 update public.referrals set reward_status='rewarded',reward_order_id=o.id where id=ref.id;
 end if;
 return 'paid';
 elsif p_state='refunded' then
 if o.refunded_at is not null then return 'already_refunded';end if;
 if o.fulfilled_at is not null then
 update public.credit_accounts set balance=balance-o.credits where user_id=o.user_id;
 if o.credits>0 then insert into public.credit_ledger(user_id,delta,reason,reference) values(o.user_id,-o.credits,'Pembatalan pembayaran','chargeback:'||o.id);end if;
 select current_period_start,current_period_end into cancelled_start,cancelled_end from public.subscriptions where order_id=o.id;
 unused=greatest(interval '0 seconds',cancelled_end-greatest(cancelled_start,now()));
 update public.subscriptions set status='refunded' where order_id=o.id;
 if unused>interval '0 seconds' then
 update public.subscriptions set current_period_start=current_period_start-unused,current_period_end=current_period_end-unused where user_id=o.user_id and status='active' and current_period_start>=cancelled_end;
 end if;
 delete from public.template_entitlements where order_id=o.id;
 update public.marketplace_sales set status='refunded' where order_id=o.id;
 select * into ref from public.referrals where reward_order_id=o.id and reward_status='rewarded' for update;
 if found then
 update public.credit_accounts set balance=balance-50 where user_id in(ref.referrer_id,ref.referred_id);
 insert into public.credit_ledger(user_id,delta,reason,reference) values(ref.referrer_id,-50,'Pembatalan bonus referral','referral_reversal:'||ref.id),(ref.referred_id,-50,'Pembatalan bonus referral','referral_reversal:'||ref.id);
 update public.referrals set reward_status='revoked' where id=ref.id;
 end if;
 end if;
 update public.payment_orders set status='refunded',refunded_at=now() where id=o.id;return 'refunded';
 elsif p_state='review' then
 update public.payment_orders set status='review' where id=o.id;return 'review';
 elsif p_state in('pending','expired','failed') then
 if o.fulfilled_at is null and o.refunded_at is null then update public.payment_orders set status=p_state where id=o.id;end if;return p_state;
 end if;raise exception 'PIWU_INVALID';
end;$$;
create function public.piwu_accept_invite(p_hash text,p_user uuid,p_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.project_invites%rowtype;begin
 select * into inv from public.project_invites where token_hash=p_hash for update;
 if not found or inv.revoked_at is not null or inv.expires_at<now() then raise exception 'PIWU_INVITE_EXPIRED';end if;
 if inv.accepted_by=p_user then return inv.project_id;end if;
 if inv.accepted_by is not null then raise exception 'PIWU_INVITE_USED';end if;
 if inv.email is not null and lower(inv.email)<>lower(coalesce(p_email,'')) then raise exception 'PIWU_INVITE_EMAIL';end if;
 if exists(select 1 from public.projects where id=inv.project_id and owner_id=p_user) then return inv.project_id;end if;
 insert into public.collaborators(project_id,user_id,role) values(inv.project_id,p_user,inv.role)
 on conflict(project_id,user_id) do update set role=case when public.collaborators.role='Editor' then 'Editor' else excluded.role end;
 update public.project_invites set accepted_by=p_user,accepted_at=now() where id=inv.id;return inv.project_id;
end;$$;
create function public.piwu_claim_publish() returns setof public.publish_jobs language plpgsql security definer set search_path='' as $$
declare job public.publish_jobs%rowtype;begin
 update public.publish_jobs set status='queued' where status='building' and lease_until<now() and attempts<3;
 update public.publish_jobs set status='failed',error='Worker tidak menyelesaikan build setelah tiga percobaan.',updated_at=now() where status='building' and lease_until<now() and attempts>=3;
 select * into job from public.publish_jobs where status='queued' order by created_at for update skip locked limit 1;
 if not found then return;end if;
 update public.publish_jobs set status='building',attempts=attempts+1,lease_until=now()+interval '15 minutes',updated_at=now() where id=job.id returning * into job;return next job;
end;$$;
-- Service role is the ONLY caller for mutations above; actor IDs come from a
-- verified access token in the API, never from request body fields.
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('piwu_ensure_credits','piwu_reserve_credits','piwu_finish_credits','piwu_apply_payment','piwu_accept_invite','piwu_claim_publish') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end $$;
-- Private Supabase Realtime channels. Skip only in test installations without Realtime.
create function public.piwu_topic_project(topic text) returns uuid language plpgsql immutable set search_path='' as $$
begin if topic ~ '^piwu:project:[0-9a-fA-F-]{36}$' then return substring(topic from 14)::uuid;end if;return null;exception when invalid_text_representation then return null;end;$$;
do $$begin
 if to_regclass('realtime.messages') is not null then
 execute 'create policy piwu_presence_read on realtime.messages for select to authenticated using(public.can_read_project(public.piwu_topic_project(realtime.topic())))';
 execute 'create policy piwu_presence_write on realtime.messages for insert to authenticated with check(public.can_read_project(public.piwu_topic_project(realtime.topic())))';
 end if;
end $$;
create function public.piwu_claim_referral(p_user uuid,p_code text) returns void language plpgsql security definer set search_path='' as $$
declare referrer uuid;begin
 perform public.piwu_ensure_credits(p_user);
 perform 1 from public.credit_accounts where user_id=p_user for update;
 if exists(select 1 from public.payment_orders where user_id=p_user and fulfilled_at is not null) then raise exception 'PIWU_REFERRAL_AFTER_PAYMENT';end if;
 select user_id into referrer from public.referral_codes where code=p_code;
 if referrer is null or referrer=p_user then raise exception 'PIWU_REFERRAL_INVALID';end if;
 insert into public.referrals(referrer_id,referred_id,reward_status) values(referrer,p_user,'pending');
end;$$;
revoke all on function public.piwu_claim_referral(uuid,text) from public,anon,authenticated;
grant execute on function public.piwu_claim_referral(uuid,text) to service_role;
-- Deleting a project schedules remote hosting cleanup, not just DB cascades.
create table public.hosting_cleanup_jobs(id uuid primary key default gen_random_uuid(),provider_site_id text not null unique,attempts integer not null default 0,error text,created_at timestamptz not null default now());
alter table public.hosting_cleanup_jobs enable row level security;
revoke all on public.hosting_cleanup_jobs from public,anon,authenticated;
create function public.piwu_queue_hosting_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.hosting_cleanup_jobs(provider_site_id) values(old.provider_site_id) on conflict do nothing;return old;end;$$;
revoke all on function public.piwu_queue_hosting_cleanup() from public,anon,authenticated;
create trigger queue_hosting_cleanup before delete on public.project_sites for each row execute function public.piwu_queue_hosting_cleanup();
create function public.piwu_complete_publish(p_job uuid,p_deployment uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.publish_jobs%rowtype;begin
 select * into j from public.publish_jobs where id=p_job for update;
 if not found or not exists(select 1 from public.deployments where id=p_deployment and project_id=j.project_id) then raise exception 'PIWU_INVALID';end if;
 if j.status='ready' then return;end if;
 if j.status<>'building' then raise exception 'PIWU_INVALID';end if;
 update public.deployments set status='ready' where id=p_deployment;
 update public.publish_jobs set status='ready',deployment_id=p_deployment,updated_at=now() where id=p_job;
 perform public.piwu_finish_credits(p_job,true);
end;$$;
revoke all on function public.piwu_complete_publish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.piwu_complete_publish(uuid,uuid) to service_role;
-- Durable recovery for abandoned requests and terminal publish jobs.
create function public.piwu_recover_credits() returns void language plpgsql security definer set search_path='' as $$
declare r record;begin
 update public.publish_jobs set status='failed',error='Antrean publish kedaluwarsa; silakan coba kembali.',updated_at=now() where status='queued' and created_at<now()-interval '1 hour';
 for r in select c.id from public.credit_reservations c where c.status='reserved' and c.created_at<now()-interval '35 minutes' and not exists(select 1 from public.publish_jobs j where j.id=c.id and j.status in('queued','building')) loop
 perform public.piwu_finish_credits(r.id,exists(select 1 from public.publish_jobs j where j.id=r.id and j.status='ready'));
 end loop;
 delete from public.analytics_events where created_at<now()-interval '31 days';
end;$$;
revoke all on function public.piwu_recover_credits() from public,anon,authenticated;
grant execute on function public.piwu_recover_credits() to service_role;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
-- Workspace events are read through existing project RLS. Realtime publication
-- is optional in PostgreSQL tests and enabled automatically on Supabase.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_workspaces') then
 alter publication supabase_realtime add table public.project_workspaces;
 end if;
end $$;

-- =====================================================================
-- 004_project_data.sql | SHA256 3a4e091d257e5af549c93c0f24d8606565ebb243b84e26c66d38052ec2bda9fd
-- =====================================================================
-- Managed project datasets, not arbitrary SQL/DDL or public application data.
-- Apply once after migrations 001–003.
create table public.project_datasets (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 80 and name=btrim(name)),
 columns jsonb not null,
 rows jsonb not null default '[]',
 revision bigint not null default 1 check(revision>0),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index project_dataset_name on public.project_datasets(project_id,lower(name));
alter table public.project_datasets enable row level security;
revoke all on public.project_datasets from public,anon,authenticated;
grant select on public.project_datasets to authenticated;
grant all on public.project_datasets to service_role;
create policy datasets_read on public.project_datasets for select to authenticated using(public.can_read_project(project_id));

create function public.piwu_validate_dataset(p_columns jsonb,p_rows jsonb) returns void language plpgsql immutable set search_path='' as $$
declare c jsonb;r jsonb;v jsonb;k text;kind text;keys text[]='{}';ids uuid[]='{}';rid uuid;begin
 if p_columns is null or p_rows is null or jsonb_typeof(p_columns)<>'array' or jsonb_typeof(p_rows)<>'array' then raise exception 'PIWU_DATA_INVALID';end if;
 if jsonb_array_length(p_columns)<1 or jsonb_array_length(p_columns)>32 or jsonb_array_length(p_rows)>1000 or octet_length(p_columns::text)+octet_length(p_rows::text)>2000000 then raise exception 'PIWU_DATA_LIMIT';end if;
 for c in select value from jsonb_array_elements(p_columns) loop
 if jsonb_typeof(c)<>'object' or jsonb_typeof(c->'key') is distinct from 'string' or jsonb_typeof(c->'label') is distinct from 'string' or jsonb_typeof(c->'type') is distinct from 'string' then raise exception 'PIWU_DATA_INVALID';end if;
 k=c->>'key';kind=c->>'type';
 if k !~ '^[a-z][a-z0-9_]{0,39}$' or k in('__proto__','constructor','prototype') or k=any(keys) or kind not in('text','number','boolean') or char_length(btrim(c->>'label')) not between 1 and 80 or exists(select 1 from jsonb_object_keys(c) a where a not in('key','label','type')) then raise exception 'PIWU_DATA_INVALID';end if;
 keys=array_append(keys,k);
 end loop;
 for r in select value from jsonb_array_elements(p_rows) loop
 if jsonb_typeof(r)<>'object' or jsonb_typeof(r->'id') is distinct from 'string' or jsonb_typeof(r->'values') is distinct from 'object' or exists(select 1 from jsonb_object_keys(r) a where a not in('id','values')) then raise exception 'PIWU_DATA_INVALID';end if;
 begin rid=(r->>'id')::uuid;exception when invalid_text_representation then raise exception 'PIWU_DATA_INVALID';end;
 if rid=any(ids) then raise exception 'PIWU_DATA_INVALID';end if;ids=array_append(ids,rid);
 if exists(select 1 from jsonb_object_keys(r->'values') a where not a=any(keys)) then raise exception 'PIWU_DATA_INVALID';end if;
 for c in select value from jsonb_array_elements(p_columns) loop
 k=c->>'key';kind=c->>'type';v=r->'values'->k;
 if v is null or jsonb_typeof(v)='null' then continue;end if;
 if (kind='text' and (jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>4000)) or (kind='number' and jsonb_typeof(v)<>'number') or (kind='boolean' and jsonb_typeof(v)<>'boolean') then raise exception 'PIWU_DATA_INVALID';end if;
 if kind='number' and abs((v#>>'{}')::numeric)>1000000000000000 then raise exception 'PIWU_DATA_INVALID';end if;
 end loop;
 end loop;
end;$$;
revoke all on function public.piwu_validate_dataset(jsonb,jsonb) from public,anon,authenticated;

create function public.piwu_save_dataset(p_project uuid,p_id uuid,p_name text,p_columns jsonb,p_rows jsonb,p_expected_revision bigint) returns public.project_datasets language plpgsql security definer set search_path='' as $$
declare d public.project_datasets%rowtype;begin
 if auth.uid() is null or not public.can_edit_project(p_project) then raise exception 'PIWU_DATA_FORBIDDEN' using errcode='42501';end if;
 -- Serializes creation limits and project deletion; no user-provided DDL.
 perform 1 from public.projects where id=p_project for update;
 if not found or not public.can_edit_project(p_project) then raise exception 'PIWU_DATA_FORBIDDEN' using errcode='42501';end if;
 if p_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 80 or p_expected_revision is null or p_expected_revision<0 then raise exception 'PIWU_DATA_INVALID';end if;
 perform public.piwu_validate_dataset(p_columns,p_rows);
 select * into d from public.project_datasets where id=p_id for update;
 if found then
 if d.project_id<>p_project then raise exception 'PIWU_DATA_FORBIDDEN' using errcode='42501';end if;
 if d.revision<>p_expected_revision then raise exception 'PIWU_DATA_CONFLICT';end if;
 update public.project_datasets set name=btrim(p_name),columns=p_columns,rows=p_rows,revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into d;
 else
 if p_expected_revision<>0 then raise exception 'PIWU_DATA_CONFLICT';end if;
 if (select count(*) from public.project_datasets where project_id=p_project)>=20 then raise exception 'PIWU_DATA_LIMIT';end if;
 insert into public.project_datasets(id,project_id,name,columns,rows,created_by,updated_by) values(p_id,p_project,btrim(p_name),p_columns,p_rows,auth.uid(),auth.uid()) returning * into d;
 end if;
 return d;
end;$$;
create function public.piwu_delete_dataset(p_project uuid,p_id uuid,p_expected_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare d public.project_datasets%rowtype;begin
 if auth.uid() is null or not public.owns_project(p_project) then raise exception 'PIWU_DATA_FORBIDDEN' using errcode='42501';end if;
 perform 1 from public.projects where id=p_project for update;
 if not found or not public.owns_project(p_project) then raise exception 'PIWU_DATA_FORBIDDEN' using errcode='42501';end if;
 select * into d from public.project_datasets where id=p_id and project_id=p_project for update;
 if not found then return;end if;
 if p_expected_revision is null or d.revision<>p_expected_revision then raise exception 'PIWU_DATA_CONFLICT';end if;
 delete from public.project_datasets where id=p_id;
end;$$;
revoke all on function public.piwu_save_dataset(uuid,uuid,text,jsonb,jsonb,bigint),public.piwu_delete_dataset(uuid,uuid,bigint) from public,anon;
grant execute on function public.piwu_save_dataset(uuid,uuid,text,jsonb,jsonb,bigint),public.piwu_delete_dataset(uuid,uuid,bigint) to authenticated;
comment on table public.project_datasets is 'Private workspace datasets. No generated application or anonymous access; not arbitrary PostgreSQL DDL. Writes only through revision-checked RPCs.';

-- =====================================================================
-- 005_admin.sql | SHA256 9f98e1a3c41ba21d0c87b115251cb28493615db9b7bb82e9aef82f5fe93ab712
-- =====================================================================
-- Platform administration. Apply once after 001–004. Bootstrap the first
-- superadmin manually with a real, verified auth.users ID; never trust metadata.
create table public.platform_admins(user_id uuid primary key references auth.users(id),role text not null check(role in('superadmin','operator','auditor')),granted_by uuid references auth.users(id),created_at timestamptz not null default now());
create table public.platform_user_controls(user_id uuid primary key references auth.users(id),suspended boolean not null default false,reason text not null,updated_at timestamptz not null default now());
create table public.platform_project_controls(project_id uuid primary key references public.projects(id) on delete cascade,locked boolean not null default false,reason text not null,updated_at timestamptz not null default now());
create table public.site_configuration(id boolean primary key default true check(id),revision bigint not null default 1,value jsonb not null default '{}',updated_at timestamptz not null default now());
insert into public.site_configuration(id,value) values(true,'{"maintenance":false,"maintenance_message":"Pemeliharaan sedang berlangsung. Coba kembali sebentar lagi.","hero_title":"","hero_subtitle":"","support_email":"","enabled_services":{"ai":true,"sandbox":true,"publish":true,"payments":true,"marketplace":true}}');
create table public.platform_broadcasts(id uuid primary key default gen_random_uuid(),title text not null check(char_length(title) between 1 and 120),body text not null check(char_length(body) between 1 and 4000),audience text not null check(audience in('public','members','pro','team')),status text not null check(status in('draft','published','archived')),starts_at timestamptz not null default now(),ends_at timestamptz,revision bigint not null default 1,created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),check(ends_at is null or ends_at>starts_at));
create table public.broadcast_reads(broadcast_id uuid not null references public.platform_broadcasts(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,read_at timestamptz not null default now(),primary key(broadcast_id,user_id));
create table public.platform_audit(id uuid primary key,actor_id uuid not null references auth.users(id),action text not null,target_id uuid,reason text not null,request_hash text not null,result jsonb not null default '{}',created_at timestamptz not null default now());
create index platform_audit_date on public.platform_audit(created_at desc);
create index broadcasts_delivery on public.platform_broadcasts(status,starts_at,ends_at);
do $$declare t text;begin
 foreach t in array array['platform_admins','platform_user_controls','platform_project_controls','site_configuration','platform_broadcasts','broadcast_reads','platform_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke update,delete on public.platform_audit from service_role;

create function public.piwu_user_active(uid uuid) returns boolean language sql stable security definer set search_path='' as $$select uid is not null and not exists(select 1 from public.platform_user_controls where user_id=uid and suspended);$$;
create function public.piwu_project_unlocked(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select not exists(select 1 from public.platform_project_controls where project_id=pid and locked);$$;
create function public.piwu_writes_open() returns boolean language sql stable security definer set search_path='' as $$select not coalesce((select (value->>'maintenance')::boolean from public.site_configuration where id),false);$$;
revoke all on function public.piwu_user_active(uuid),public.piwu_project_unlocked(uuid),public.piwu_writes_open() from public,anon;
grant execute on function public.piwu_user_active(uuid),public.piwu_project_unlocked(uuid),public.piwu_writes_open() to authenticated,service_role;
create or replace function public.owns_project(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select public.piwu_user_active(auth.uid()) and public.piwu_project_unlocked(pid) and exists(select 1 from public.projects where id=pid and owner_id=auth.uid());$$;
create or replace function public.can_read_project(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select public.piwu_user_active(auth.uid()) and (exists(select 1 from public.projects where id=pid and owner_id=auth.uid()) or exists(select 1 from public.collaborators where project_id=pid and user_id=auth.uid()));$$;
create or replace function public.can_edit_project(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select public.piwu_writes_open() and public.piwu_user_active(auth.uid()) and public.piwu_project_unlocked(pid) and (exists(select 1 from public.projects where id=pid and owner_id=auth.uid()) or exists(select 1 from public.collaborators where project_id=pid and user_id=auth.uid() and role='Editor'));$$;
-- Restrictive policies preserve existing project/owner policies while ensuring
-- suspended users cannot bypass the API with an already-issued access token.
do $$declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' loop
 execute format('create policy platform_active_actor on public.%I as restrictive for all to authenticated using(public.piwu_user_active(auth.uid())) with check(public.piwu_user_active(auth.uid()))',t.tablename);
 end loop;
end $$;
create policy platform_active_actor on storage.objects as restrictive for all to authenticated using(public.piwu_user_active(auth.uid())) with check(public.piwu_user_active(auth.uid()));

-- Prevent direct project metadata writes from bypassing maintenance/locks.
create policy platform_project_insert on public.projects as restrictive for insert to authenticated with check(public.piwu_writes_open());
create policy platform_project_update on public.projects as restrictive for update to authenticated using(public.piwu_writes_open() and public.piwu_project_unlocked(id)) with check(public.piwu_writes_open() and public.piwu_project_unlocked(id));
create policy platform_project_delete on public.projects as restrictive for delete to authenticated using(public.piwu_writes_open() and public.piwu_project_unlocked(id));
-- Existing SECURITY DEFINER RPCs must also honor suspension, maintenance and locks.
alter function public.piwu_list_workspaces() rename to piwu_list_workspaces_base;
alter function public.piwu_save_workspace(uuid,jsonb,bigint) rename to piwu_save_workspace_base;
alter function public.piwu_delete_workspace(uuid,bigint) rename to piwu_delete_workspace_base;
alter function public.piwu_delete_dataset(uuid,uuid,bigint) rename to piwu_delete_dataset_base;
revoke all on function public.piwu_list_workspaces_base(),public.piwu_save_workspace_base(uuid,jsonb,bigint),public.piwu_delete_workspace_base(uuid,bigint),public.piwu_delete_dataset_base(uuid,uuid,bigint) from public,anon,authenticated,service_role;
create function public.piwu_list_workspaces() returns table(payload jsonb,revision bigint,owner_id uuid,access_role text,updated_at timestamptz) language plpgsql stable security definer set search_path='' as $$begin if not public.piwu_user_active(auth.uid()) then raise exception 'PIWU_PERMISSION' using errcode='42501';end if;return query select * from public.piwu_list_workspaces_base();end;$$;
create function public.piwu_save_workspace(p_id uuid,p_payload jsonb,p_expected_revision bigint) returns table(payload jsonb,revision bigint,owner_id uuid,access_role text,updated_at timestamptz) language plpgsql security definer set search_path='' as $$begin if not public.piwu_user_active(auth.uid()) or not public.piwu_writes_open() or not public.piwu_project_unlocked(p_id) then raise exception 'PIWU_PERMISSION' using errcode='42501';end if;return query select * from public.piwu_save_workspace_base(p_id,p_payload,p_expected_revision);end;$$;
create function public.piwu_delete_workspace(p_id uuid,p_expected_revision bigint) returns void language plpgsql security definer set search_path='' as $$begin if not public.piwu_user_active(auth.uid()) or not public.piwu_writes_open() or not public.piwu_project_unlocked(p_id) then raise exception 'PIWU_PERMISSION' using errcode='42501';end if;perform public.piwu_delete_workspace_base(p_id,p_expected_revision);end;$$;
create function public.piwu_delete_dataset(p_project uuid,p_id uuid,p_expected_revision bigint) returns void language plpgsql security definer set search_path='' as $$begin if not public.piwu_user_active(auth.uid()) or not public.piwu_writes_open() or not public.piwu_project_unlocked(p_project) then raise exception 'PIWU_DATA_FORBIDDEN' using errcode='42501';end if;perform public.piwu_delete_dataset_base(p_project,p_id,p_expected_revision);end;$$;
revoke all on function public.piwu_list_workspaces(),public.piwu_save_workspace(uuid,jsonb,bigint),public.piwu_delete_workspace(uuid,bigint),public.piwu_delete_dataset(uuid,uuid,bigint) from public,anon;
grant execute on function public.piwu_list_workspaces(),public.piwu_save_workspace(uuid,jsonb,bigint),public.piwu_delete_workspace(uuid,bigint),public.piwu_delete_dataset(uuid,uuid,bigint) to authenticated;
-- Direct writes to project child tables also honor the project lock.
do $$declare t record;begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='project_id' and table_name not in('platform_project_controls') loop
 execute format('create policy platform_project_insert on public.%I as restrictive for insert to authenticated with check(public.piwu_project_unlocked(project_id) and public.piwu_writes_open())',t.table_name);
 execute format('create policy platform_project_update on public.%I as restrictive for update to authenticated using(public.piwu_project_unlocked(project_id) and public.piwu_writes_open()) with check(public.piwu_project_unlocked(project_id) and public.piwu_writes_open())',t.table_name);
 execute format('create policy platform_project_delete on public.%I as restrictive for delete to authenticated using(public.piwu_project_unlocked(project_id) and public.piwu_writes_open())',t.table_name);
 end loop;
end $$;

create function public.piwu_broadcast_feed(p_user uuid) returns table(id uuid,title text,body text,audience text,starts_at timestamptz,ends_at timestamptz,read boolean) language sql stable security definer set search_path='' as $$
 select b.id,b.title,b.body,b.audience,b.starts_at,b.ends_at,exists(select 1 from public.broadcast_reads r where r.broadcast_id=b.id and r.user_id=p_user)
 from public.platform_broadcasts b where b.status='published' and b.starts_at<=now() and (b.ends_at is null or b.ends_at>now()) and (b.audience='public' or (public.piwu_user_active(p_user) and (b.audience='members' or exists(select 1 from public.subscriptions s where s.user_id=p_user and s.status='active' and s.current_period_start<=now() and s.current_period_end>now() and lower(s.plan)=b.audience)))) order by b.starts_at desc limit 20;
$$;
create function public.piwu_broadcast_read(p_user uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin if not public.piwu_user_active(p_user) or not exists(select 1 from public.piwu_broadcast_feed(p_user) where id=p_id) then raise exception 'ADMIN_FORBIDDEN' using errcode='42501';end if;insert into public.broadcast_reads(broadcast_id,user_id) values(p_id,p_user) on conflict do nothing;end;$$;

create function public.piwu_admin_action(p_actor uuid,p_request uuid,p_action text,p_target uuid,p_payload jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;request_hash text;previous public.platform_audit%rowtype;result jsonb='{}';rev bigint;bal integer;delta integer;v_role text;job_record record;begin
 perform pg_advisory_xact_lock(918273645);
 select role into actor_role from public.platform_admins where user_id=p_actor;
 if actor_role is null or actor_role='auditor' or not public.piwu_user_active(p_actor) then raise exception 'ADMIN_FORBIDDEN' using errcode='42501';end if;
 if p_action is null or p_request is null or p_reason is null or char_length(btrim(p_reason)) not between 8 and 500 or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then raise exception 'ADMIN_INVALID';end if;
 request_hash=md5(p_action||coalesce(p_target::text,'')||p_payload::text||p_reason);
 select * into previous from public.platform_audit where id=p_request;
 if found then if previous.actor_id<>p_actor or previous.request_hash<>request_hash then raise exception 'ADMIN_DUPLICATE';end if;return previous.result;end if;
 if p_action in('admin_role','credits','user_suspend','settings','project_delete') and actor_role<>'superadmin' then raise exception 'ADMIN_FORBIDDEN' using errcode='42501';end if;
 case p_action
 when 'admin_role' then
 if not exists(select 1 from auth.users where id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 v_role=p_payload->>'role';if v_role not in('superadmin','operator','auditor','remove') or v_role is null then raise exception 'ADMIN_INVALID';end if;
 if exists(select 1 from public.platform_admins where user_id=p_target and role='superadmin') and v_role<>'superadmin' and (select count(*) from public.platform_admins where role='superadmin')<=1 then raise exception 'ADMIN_LAST_SUPERADMIN';end if;
 if v_role<>'remove' and not public.piwu_user_active(p_target) then raise exception 'ADMIN_INVALID';end if;
 if v_role='remove' then delete from public.platform_admins where user_id=p_target;
 else insert into public.platform_admins(user_id,role,granted_by) values(p_target,v_role,p_actor) on conflict(user_id) do update set role=excluded.role,granted_by=p_actor;end if;
 when 'user_suspend' then
 if not exists(select 1 from auth.users where id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 if p_payload->>'suspended' not in('true','false') or p_payload->>'suspended' is null then raise exception 'ADMIN_INVALID';end if;
 if exists(select 1 from public.platform_admins where user_id=p_target) then raise exception 'ADMIN_REMOVE_ROLE_FIRST';end if;
 insert into public.platform_user_controls(user_id,suspended,reason) values(p_target,(p_payload->>'suspended')::boolean,p_reason) on conflict(user_id) do update set suspended=excluded.suspended,reason=excluded.reason,updated_at=now();
 when 'credits' then
 if jsonb_typeof(p_payload->'delta') is distinct from 'number' then raise exception 'ADMIN_INVALID';end if;
 delta=(p_payload->>'delta')::integer;if delta=0 or abs(delta)>10000 or delta::numeric<>(p_payload->>'delta')::numeric then raise exception 'ADMIN_INVALID';end if;
 perform public.piwu_ensure_credits(p_target);select balance into bal from public.credit_accounts where user_id=p_target for update;
 if bal+delta<0 then raise exception 'ADMIN_NEGATIVE_BALANCE';end if;
 update public.credit_accounts set balance=balance+delta where user_id=p_target;
 insert into public.credit_ledger(user_id,delta,reason,reference) values(p_target,delta,'Penyesuaian admin: '||p_reason,'admin:'||p_request);result=jsonb_build_object('balance',bal+delta);
 when 'project_lock' then
 if not exists(select 1 from public.projects where id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 if p_payload->>'locked' not in('true','false') or p_payload->>'locked' is null then raise exception 'ADMIN_INVALID';end if;
 insert into public.platform_project_controls(project_id,locked,reason) values(p_target,(p_payload->>'locked')::boolean,p_reason) on conflict(project_id) do update set locked=excluded.locked,reason=excluded.reason,updated_at=now();
 when 'project_delete' then
 for job_record in select id,status from public.publish_jobs where project_id=p_target and status in('queued','building') for update loop
 if job_record.status='building' then raise exception 'ADMIN_CONFLICT';end if;
 perform public.piwu_finish_credits(job_record.id,false);
 end loop;
 if p_payload->>'confirmation' is distinct from p_target::text then raise exception 'ADMIN_INVALID';end if;
 delete from public.projects where id=p_target;if not found then raise exception 'ADMIN_NOT_FOUND';end if;
 when 'template_status' then
 if p_payload->>'status' not in('published','archived') or p_payload->>'status' is null then raise exception 'ADMIN_INVALID';end if;
 update public.templates set status=p_payload->>'status' where id=p_target;if not found then raise exception 'ADMIN_NOT_FOUND';end if;
 when 'recording_revoke' then
 if not exists(select 1 from public.recording_shares where recording_id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 update public.recording_shares set revoked_at=now() where recording_id=p_target and revoked_at is null;
 when 'publish_cancel' then
 perform 1 from public.publish_jobs where id=p_target and status='queued' for update;if not found then raise exception 'ADMIN_CONFLICT';end if;
 update public.publish_jobs set status='failed',error='Dibatalkan administrator.',updated_at=now() where id=p_target;perform public.piwu_finish_credits(p_target,false);
 when 'hosting_retry' then
 update public.hosting_cleanup_jobs set attempts=0,error=null where id=p_target;if not found then raise exception 'ADMIN_NOT_FOUND';end if;
 when 'unpublish' then
 perform 1 from public.publish_jobs where project_id=p_target and status in('queued','building') for update;
 if found then raise exception 'ADMIN_CONFLICT';end if;
 if not exists(select 1 from public.project_sites where project_id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 insert into public.platform_project_controls(project_id,locked,reason) values(p_target,true,p_reason) on conflict(project_id) do update set locked=true,reason=p_reason,updated_at=now();
 delete from public.project_sites where project_id=p_target;update public.deployments set status='unpublish_queued' where project_id=p_target and status='ready';result='{"queued":true}';
 when 'payment_reconcile' then
 result=jsonb_build_object('status',public.piwu_apply_payment(p_target,(p_payload->>'amount')::integer,p_payload->>'currency',p_payload->>'state'));
 when 'broadcast_save' then
 if p_target is null or char_length(coalesce(p_payload->>'title','')) not between 1 and 120 or char_length(coalesce(p_payload->>'body','')) not between 1 and 4000 or p_payload->>'audience' not in('public','members','pro','team') or p_payload->>'status' not in('draft','published','archived') or p_payload->>'revision' is null then raise exception 'ADMIN_INVALID';end if;
 select revision into rev from public.platform_broadcasts where id=p_target for update;
 if coalesce(rev,0)<>(p_payload->>'revision')::bigint then raise exception 'ADMIN_CONFLICT';end if;
 insert into public.platform_broadcasts(id,title,body,audience,status,starts_at,ends_at,created_by) values(p_target,p_payload->>'title',p_payload->>'body',p_payload->>'audience',p_payload->>'status',(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,p_actor)
 on conflict(id) do update set title=excluded.title,body=excluded.body,audience=excluded.audience,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,revision=public.platform_broadcasts.revision+1,updated_at=now();
 result=jsonb_build_object('revision',coalesce(rev,0)+1);
 when 'settings' then
 select revision into rev from public.site_configuration where id for update;
 if p_payload->>'revision' is null or rev<>(p_payload->>'revision')::bigint then raise exception 'ADMIN_CONFLICT';end if;
 if jsonb_typeof(p_payload->'value') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload->'value') k where k not in('maintenance','maintenance_message','hero_title','hero_subtitle','support_email','enabled_services')) then raise exception 'ADMIN_INVALID';end if;
 if jsonb_typeof(p_payload->'value'->'maintenance') is distinct from 'boolean' then raise exception 'ADMIN_INVALID';end if;
 update public.site_configuration set value=p_payload->'value',revision=revision+1,updated_at=now() where id;result=jsonb_build_object('revision',rev+1);
 else raise exception 'ADMIN_INVALID';end case;
 insert into public.platform_audit(id,actor_id,action,target_id,reason,request_hash,result) values(p_request,p_actor,p_action,p_target,p_reason,request_hash,result);
 return result;
end;$$;
revoke all on function public.piwu_admin_action(uuid,uuid,text,uuid,jsonb,text),public.piwu_broadcast_feed(uuid),public.piwu_broadcast_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.piwu_admin_action(uuid,uuid,text,uuid,jsonb,text),public.piwu_broadcast_feed(uuid),public.piwu_broadcast_read(uuid,uuid) to service_role;

-- =====================================================================
-- 006_studio_bridge.sql | SHA256 992af0491831c817b480a3307ee514afbc48061abbcc845cfd7a0bf6719b9288
-- =====================================================================
-- Apply once after 005_admin.sql. Server-only bridge credentials and inbox.
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

-- =====================================================================
-- 007_runtime_coordination.sql | SHA256 5f97d620f5f82d050c1344842495b021fb70eedda09591ef852458f339dbecf1
-- =====================================================================
-- Shared runtime admission controls. Apply after 001–006. No browser access.
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

-- =====================================================================
-- 008_admin_directory.sql | SHA256 0af4909401fef93559dde400cc9b06d0f1ac938300088fa4b5ac75991a95c711
-- =====================================================================
-- Search the real auth directory without returning credentials/tokens or arbitrary metadata.
create or replace function public.piwu_admin_users(p_actor uuid,p_query text default '',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare items jsonb;
begin
  if not exists(select 1 from platform_admins where user_id=p_actor) or not public.piwu_user_active(p_actor) then raise exception 'ADMIN_FORBIDDEN' using errcode='42501'; end if;
  if p_query is null or length(p_query)>100 or p_page is null or p_page not between 1 and 10000 then raise exception 'ADMIN_INVALID'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into items from (
    select u.id,coalesce(u.email,'') email,left(coalesce(u.raw_user_meta_data->>'name',''),100) name,
      u.created_at,u.last_sign_in_at,(u.email_confirmed_at is not null or u.phone_confirmed_at is not null) verified,
      c.balance,coalesce(g.suspended,false) suspended,a.role admin_role
    from auth.users u left join credit_accounts c on c.user_id=u.id
    left join platform_user_controls g on g.user_id=u.id left join platform_admins a on a.user_id=u.id
    where p_query='' or position(lower(p_query) in lower(concat_ws(' ',u.id::text,u.email,u.raw_user_meta_data->>'name')))>0
    order by u.created_at desc nulls last,u.id desc limit 26 offset (p_page-1)*25
  ) r;
  return jsonb_build_object('page',p_page,'hasMore',jsonb_array_length(items)>25,'items',items-25);
end $$;
revoke all on function public.piwu_admin_users(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.piwu_admin_users(uuid,text,integer) to service_role;

-- =====================================================================
-- 009_search_cache.sql | SHA256 7c0052f7d18ebb296d23b0b29110dc1e52ef7ca8338857a0899bb8cc95cd4045
-- =====================================================================
-- Shared search cache. Apply after 001–008. Service role only: no browser access.
--
-- Why a table and not Redis: search results are already stored server-side, the
-- project already depends on Supabase, and a second instance that asks the same
-- question within 15 minutes must not pay the vendor twice. Without this
-- migration the app still works — it simply caches per process and says so in
-- the admin diagnostics endpoint.
create table if not exists public.runtime_search_cache (
  key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists runtime_search_cache_expiry on public.runtime_search_cache(expires_at);
alter table public.runtime_search_cache enable row level security;
revoke all on public.runtime_search_cache from public, anon, authenticated;
grant select, insert, update, delete on public.runtime_search_cache to service_role;

-- =====================================================================
-- 010_credit_lots.sql | SHA256 3903a223186d2b4b388a02265f10308616484ecf8c2d95d716f482fbb12773d4
-- =====================================================================
-- 010: credit lots, the daily allowance and expiry.
--
-- Until 009 a balance was one number: nothing to expire, nothing to reset. This
-- migration gives credits the rules the pricing page states:
--   * a daily allowance that refills to its cap at 00:00 UTC and never
--     accumulates -- unused daily credits are gone at the next reset,
--   * plan credits that roll over while the subscription runs but expire two
--     months after they are issued,
--   * top-up and referral credits valid twelve months,
--   * every spend draws from the lot that expires soonest, and a failed
--     operation returns credits under the same policy it took them from.
--
-- `credit_accounts.balance` stays the number the API and the UI read; the lots
-- are the record behind it. The two are kept in step by every function below
-- (tests/credit-lots.test.ts asserts it), and a chargeback that outlives the
-- credits is allowed to push the balance negative, the way it did before 010.

create table public.credit_lots (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check (source in ('daily','plan','topup','bonus','admin','refund')),
 amount integer not null check (amount > 0),
 remaining integer not null check (remaining >= 0),
 granted_at timestamptz not null default now(),
 expires_at timestamptz,
 reference text
);
create index credit_lots_user_expiry on public.credit_lots(user_id, expires_at nulls last, granted_at);
alter table public.credit_lots enable row level security;
create policy credit_lots_read on public.credit_lots for select to authenticated using(user_id=(select auth.uid()));
grant select on public.credit_lots to authenticated;
alter table public.credit_reservations add column lots jsonb;

-- The numbers the pricing page prints. shared/credits.mjs mirrors them and
-- tests/credits-model.test.ts fails if the two drift apart.
create function public.piwu_credit_policy() returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'dailyFree',20,'dailyPro',20,'dailyTeam',40,'freeMonthlyCap',600,
  'planMonths',2,'topupMonths',12,'resetUtcHour',0);
$$;

-- When a lot of this source stops being spendable, measured from p_at.
create function public.piwu_lot_expiry(p_source text,p_at timestamptz) returns timestamptz language sql stable set search_path='' as $$
with policy as (
 select (public.piwu_credit_policy()->>'resetUtcHour')::integer as h,
        (public.piwu_credit_policy()->>'planMonths')::integer as pm,
        (public.piwu_credit_policy()->>'topupMonths')::integer as tm)
select case p_source
 when 'daily' then ((date_trunc('day',(p_at at time zone 'utc')-make_interval(hours=>h))+interval '1 day'+make_interval(hours=>h)) at time zone 'utc')
 when 'plan' then p_at+make_interval(months=>pm)
 when 'topup' then p_at+make_interval(months=>tm)
 when 'bonus' then p_at+make_interval(months=>tm)
 when 'refund' then p_at+make_interval(months=>tm)
 else null
end from policy;
$$;

-- Add credits: one lot, the balance, and one ledger row. Never called with a
-- non-positive amount; callers check first so a no-op writes nothing.
create function public.piwu_grant_credits(p_user uuid,p_amount integer,p_source text,p_reason text,p_expires_at timestamptz,p_reference text) returns integer language plpgsql security definer set search_path='' as $$
declare result integer;begin
 if p_amount is null or p_amount<=0 then raise exception 'PIWU_INVALID';end if;
 insert into public.credit_lots(user_id,source,amount,remaining,expires_at,reference) values(p_user,p_source,p_amount,p_amount,p_expires_at,p_reference);
 update public.credit_accounts set balance=balance+p_amount where user_id=p_user;
 insert into public.credit_ledger(user_id,delta,reason,reference) values(p_user,p_amount,p_reason,p_reference) on conflict do nothing;
 select balance into result from public.credit_accounts where user_id=p_user;return result;
end;$$;

-- Take credits away (chargeback, referral reversal, admin correction): the
-- soonest-expiring lots give first, and a shortfall is left as a negative
-- balance because the money really did leave the account.
create function public.piwu_revoke_credits(p_user uuid,p_amount integer,p_reason text,p_reference text) returns integer language plpgsql security definer set search_path='' as $$
declare need integer;p_lot record;taken integer;result integer;begin
 if p_amount is null or p_amount<=0 then raise exception 'PIWU_INVALID';end if;
 need:=p_amount;
 for p_lot in select id,remaining from public.credit_lots where user_id=p_user and remaining>0 order by expires_at nulls last,granted_at asc,id for update loop
  exit when need<=0;
  taken:=least(p_lot.remaining,need);
  update public.credit_lots set remaining=remaining-taken where id=p_lot.id;
  need:=need-taken;
 end loop;
 update public.credit_accounts set balance=balance-p_amount where user_id=p_user;
 insert into public.credit_ledger(user_id,delta,reason,reference) values(p_user,-p_amount,p_reason,p_reference) on conflict do nothing;
 select balance into result from public.credit_accounts where user_id=p_user;return result;
end;$$;

-- The daily allowance. Refills to the cap once per UTC day, never accumulates,
-- and stops for Free accounts once the month's cap is reached. Returns what was
-- granted (0 when today's allowance is already in the account).
create function public.piwu_claim_daily(p_user uuid) returns integer language plpgsql security definer set search_path='' as $$
declare policy jsonb;day_key text;plan_name text;allowance integer;month_total integer;granted integer;begin
 policy:=public.piwu_credit_policy();
 insert into public.credit_accounts(user_id,balance) values(p_user,0) on conflict do nothing;
 day_key:=to_char((now() at time zone 'utc'),'YYYY-MM-DD');
 if exists(select 1 from public.credit_lots where user_id=p_user and source='daily' and reference='daily:'||day_key) then return 0;end if;
 select plan into plan_name from public.subscriptions where user_id=p_user and status='active' and current_period_end>now() order by current_period_end desc limit 1;
 if plan_name='Team' then allowance:=(policy->>'dailyTeam')::integer;
 elsif plan_name='Pro' then allowance:=(policy->>'dailyPro')::integer;
 else
  allowance:=(policy->>'dailyFree')::integer;
  select coalesce(sum(amount),0) into month_total from public.credit_lots where user_id=p_user and source='daily' and (granted_at at time zone 'utc')>=date_trunc('month',(now() at time zone 'utc'));
  if month_total>=(policy->>'freeMonthlyCap')::integer then return 0;end if;
  allowance:=least(allowance,(policy->>'freeMonthlyCap')::integer-month_total);
 end if;
 granted:=public.piwu_grant_credits(p_user,allowance,'daily','Jatah harian',public.piwu_lot_expiry('daily',now()),'daily:'||day_key);
 return allowance;
end;$$;

-- Read-only facts about today's allowance, for GET /api/account: what the plan
-- grants per day, how much of it is still unspent, how far the Free cap is, and
-- when the next reset happens. The reset instant is exactly the daily lot's
-- expiry (piwu_lot_expiry), so a countdown in the UI cannot point at a time the
-- database does not use. Writes nothing: call piwu_ensure_credits first if the
-- day has not been claimed yet.
create function public.piwu_credit_status(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare policy jsonb;plan_name text;allowance integer;claimed integer;left_over integer;month_total integer;h integer;begin
 policy:=public.piwu_credit_policy();h:=(policy->>'resetUtcHour')::integer;
 select plan into plan_name from public.subscriptions where user_id=p_user and status='active' and current_period_end>now() order by current_period_end desc limit 1;
 if plan_name='Team' then allowance:=(policy->>'dailyTeam')::integer;
 elsif plan_name='Pro' then allowance:=(policy->>'dailyPro')::integer;
 else allowance:=(policy->>'dailyFree')::integer;end if;
 select coalesce(sum(l.remaining),0),coalesce(sum(l.amount),0) into left_over,claimed from public.credit_lots l
  where l.user_id=p_user and l.source='daily' and l.reference='daily:'||to_char((now() at time zone 'utc'),'YYYY-MM-DD');
 select coalesce(sum(l.amount),0) into month_total from public.credit_lots l
  where l.user_id=p_user and l.source='daily' and (l.granted_at at time zone 'utc')>=date_trunc('month',(now() at time zone 'utc'));
 return jsonb_build_object(
  'applied',true,'source','database',
  'plan',coalesce(plan_name,'Free'),
  'daily',allowance,'dailyClaimed',claimed,'dailyRemaining',left_over,
  'monthlyCap',case when plan_name in('Pro','Team') then null else (policy->>'freeMonthlyCap')::integer end,
  'monthlyUsed',month_total,
  'resetUtcHour',h,'resetAt',public.piwu_lot_expiry('daily',now()),
  'planMonths',(policy->>'planMonths')::integer,'topupMonths',(policy->>'topupMonths')::integer);
end;$$;

create or replace function public.piwu_ensure_credits(p_user uuid) returns integer language plpgsql security definer set search_path='' as $$
declare result integer;begin
 insert into public.credit_accounts(user_id,balance) values(p_user,0) on conflict do nothing;
 perform public.piwu_claim_daily(p_user);
 select balance into result from public.credit_accounts where user_id=p_user;return result;
end;$$;

create or replace function public.piwu_reserve_credits(p_user uuid,p_id uuid,p_amount integer,p_purpose text) returns integer language plpgsql security definer set search_path='' as $$
declare available integer;need integer;p_lot record;taken integer;draws jsonb:='[]'::jsonb;begin
 if p_amount is null or p_amount<1 or p_amount>1000 or p_id is null then raise exception 'PIWU_INVALID';end if;
 perform public.piwu_ensure_credits(p_user);
 select balance into available from public.credit_accounts where user_id=p_user for update;
 if exists(select 1 from public.credit_reservations where id=p_id) then raise exception 'PIWU_DUPLICATE';end if;
 if available<p_amount then raise exception 'PIWU_CREDITS';end if;
 if (select count(*) from public.credit_reservations where user_id=p_user and created_at>now()-interval '1 hour')>=120 then raise exception 'PIWU_RATE';end if;
 need:=p_amount;
 for p_lot in select id,remaining from public.credit_lots where user_id=p_user and remaining>0 order by expires_at nulls last,granted_at asc,id for update loop
  exit when need<=0;
  taken:=least(p_lot.remaining,need);
  update public.credit_lots set remaining=remaining-taken where id=p_lot.id;
  draws:=draws||jsonb_build_object('lot',p_lot.id,'amount',taken);
  need:=need-taken;
 end loop;
 if need>0 then raise exception 'PIWU_CREDITS';end if;
 insert into public.credit_reservations(id,user_id,amount,purpose,lots) values(p_id,p_user,p_amount,p_purpose,draws);
 update public.credit_accounts set balance=balance-p_amount where user_id=p_user;
 insert into public.credit_ledger(user_id,delta,reason,reference) values(p_user,-p_amount,p_purpose,'reserve:'||p_id);
 return available-p_amount;
end;$$;

create or replace function public.piwu_finish_credits(p_id uuid,p_success boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.credit_reservations%rowtype;entry jsonb;v_lot public.credit_lots%rowtype;back timestamptz;begin
 select * into r from public.credit_reservations where id=p_id for update;
 if not found or r.status<>'reserved' then return;end if;
 if p_success then update public.credit_reservations set status='settled',updated_at=now() where id=p_id;
 else
  for entry in select * from jsonb_array_elements(coalesce(r.lots,'[]'::jsonb)) loop
   select * into v_lot from public.credit_lots where id=(entry->>'lot')::uuid for update;
   if found then
    back:=public.piwu_lot_expiry(v_lot.source,now());
    -- A refund must not die in the same minute it is issued: spendable again
    -- for at least an hour, then it follows the policy of its own lot.
    if back is not null and back<now()+interval '1 hour' then back:=now()+interval '1 hour';end if;
    update public.credit_lots set remaining=remaining+(entry->>'amount')::integer,expires_at=back where id=v_lot.id;
   else
    insert into public.credit_lots(user_id,source,amount,remaining,expires_at,reference) values(r.user_id,'refund',(entry->>'amount')::integer,(entry->>'amount')::integer,public.piwu_lot_expiry('refund',now()),'refund:'||p_id);
   end if;
  end loop;
  -- Reservations made before this migration carry no breakdown.
  if r.lots is null or r.lots='[]'::jsonb then
   insert into public.credit_lots(user_id,source,amount,remaining,expires_at,reference) values(r.user_id,'refund',r.amount,r.amount,public.piwu_lot_expiry('refund',now()),'refund:'||p_id);
  end if;
  update public.credit_accounts set balance=balance+r.amount where user_id=r.user_id;
  insert into public.credit_ledger(user_id,delta,reason,reference) values(r.user_id,r.amount,'Pengembalian proses gagal','refund:'||p_id) on conflict do nothing;
  update public.credit_reservations set status='refunded',updated_at=now() where id=p_id;
 end if;
end;$$;

-- Zero every lot whose time is up and tell each owner once. Called by
-- piwu_recover_credits and directly by the server's sweep.
create function public.piwu_expire_credits() returns integer language plpgsql security definer set search_path='' as $$
declare r record;total integer:=0;begin
 for r in select user_id,sum(remaining)::integer as lost,array_agg(id) as ids from public.credit_lots where remaining>0 and expires_at is not null and expires_at<=now() group by user_id loop
  update public.credit_lots set remaining=0 where id=any(r.ids);
  update public.credit_accounts set balance=balance-r.lost where user_id=r.user_id;
  insert into public.credit_ledger(user_id,delta,reason,reference) values(r.user_id,-r.lost,'Kredit kedaluwarsa','expire:'||r.user_id||':'||to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')) on conflict do nothing;
  total:=total+r.lost;
 end loop;
 return total;
end;$$;

-- Accounts that existed before 010 keep what they had, as a twelve-month lot:
-- nobody loses a credit to the migration.
insert into public.credit_lots(user_id,source,amount,remaining,expires_at,reference)
select a.user_id,'topup',a.balance,a.balance,public.piwu_lot_expiry('topup',now()),'migrasi-010:'||a.user_id
from public.credit_accounts a
where a.balance>0 and not exists(select 1 from public.credit_lots l where l.user_id=a.user_id);

create or replace function public.piwu_apply_payment(p_id uuid,p_amount integer,p_currency text,p_state text) returns text language plpgsql security definer set search_path='' as $$
declare o public.payment_orders%rowtype;ref public.referrals%rowtype;seller uuid;period_end timestamptz;cancelled_start timestamptz;cancelled_end timestamptz;unused interval;begin
 select * into o from public.payment_orders where id=p_id for update;
 if not found or p_amount is null or o.amount<>p_amount or o.currency is distinct from p_currency then raise exception 'PIWU_PAYMENT_MISMATCH';end if;
 if p_state='paid' then
 if o.refunded_at is not null then return 'refunded';end if;
 if o.fulfilled_at is not null then return 'already_paid';end if;
 perform public.piwu_ensure_credits(o.user_id);
 if o.credits>0 then
 perform public.piwu_grant_credits(o.user_id,o.credits,case when o.kind='topup' then 'topup' else 'plan' end,'Pembayaran terverifikasi',public.piwu_lot_expiry(case when o.kind='topup' then 'topup' else 'plan' end,now()),'payment:'||o.id);
 end if;
 if o.kind='plan' then
 select greatest(now(),coalesce(max(current_period_end),now()))+interval '30 days' into period_end from public.subscriptions where user_id=o.user_id and status='active';
 insert into public.subscriptions(user_id,plan,provider,status,current_period_start,current_period_end,order_id) values(o.user_id,o.plan,o.provider,'active',period_end-interval '30 days',period_end,o.id);
 elsif o.kind='template' then
 select owner_id into seller from public.templates where id=o.template_id;
 insert into public.template_entitlements(user_id,template_id,order_id) values(o.user_id,o.template_id,o.id) on conflict do nothing;
 insert into public.marketplace_sales(order_id,seller_id,buyer_id,gross,platform_fee,net) values(o.id,seller,o.user_id,o.amount,(o.amount*0.2)::integer,o.amount-(o.amount*0.2)::integer);
 end if;
 update public.payment_orders set status='paid',fulfilled_at=now() where id=o.id;
 select * into ref from public.referrals where referred_id=o.user_id and reward_status='pending' and o.kind in('plan','topup') and o.amount>=49000 for update;
 if found then
 perform public.piwu_ensure_credits(ref.referrer_id);
 perform public.piwu_grant_credits(ref.referrer_id,50,'bonus','Bonus referral',public.piwu_lot_expiry('bonus',now()),'referral:'||ref.id||':a');
 perform public.piwu_grant_credits(ref.referred_id,50,'bonus','Bonus referral',public.piwu_lot_expiry('bonus',now()),'referral:'||ref.id||':b');
 update public.referrals set reward_status='rewarded',reward_order_id=o.id where id=ref.id;
 end if;
 return 'paid';
 elsif p_state='refunded' then
 if o.refunded_at is not null then return 'already_refunded';end if;
 if o.fulfilled_at is not null then
 if o.credits>0 then perform public.piwu_revoke_credits(o.user_id,o.credits,'Pembatalan pembayaran','chargeback:'||o.id);end if;
 select current_period_start,current_period_end into cancelled_start,cancelled_end from public.subscriptions where order_id=o.id;
 unused=greatest(interval '0 seconds',cancelled_end-greatest(cancelled_start,now()));
 update public.subscriptions set status='refunded' where order_id=o.id;
 if unused>interval '0 seconds' then
 update public.subscriptions set current_period_start=current_period_start-unused,current_period_end=current_period_end-unused where user_id=o.user_id and status='active' and current_period_start>=cancelled_end;
 end if;
 delete from public.template_entitlements where order_id=o.id;
 update public.marketplace_sales set status='refunded' where order_id=o.id;
 select * into ref from public.referrals where reward_order_id=o.id and reward_status='rewarded' for update;
 if found then
 perform public.piwu_revoke_credits(ref.referrer_id,50,'Pembatalan bonus referral','referral_reversal:'||ref.id||':a');
 perform public.piwu_revoke_credits(ref.referred_id,50,'Pembatalan bonus referral','referral_reversal:'||ref.id||':b');
 update public.referrals set reward_status='revoked' where id=ref.id;
 end if;
 end if;
 update public.payment_orders set status='refunded',refunded_at=now() where id=o.id;return 'refunded';
 elsif p_state='review' then
 update public.payment_orders set status='review' where id=o.id;return 'review';
 elsif p_state in('pending','expired','failed') then
 if o.fulfilled_at is null and o.refunded_at is null then update public.payment_orders set status=p_state where id=o.id;end if;return p_state;
 end if;raise exception 'PIWU_INVALID';
end;$$;
create or replace function public.piwu_admin_action(p_actor uuid,p_request uuid,p_action text,p_target uuid,p_payload jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;request_hash text;previous record;result jsonb='{}';rev bigint;bal integer;delta integer;v_role text;job_record record;begin
 perform pg_advisory_xact_lock(918273645);
 select role into actor_role from public.platform_admins where user_id=p_actor;
 if actor_role is null or actor_role='auditor' or not public.piwu_user_active(p_actor) then raise exception 'ADMIN_FORBIDDEN' using errcode='42501';end if;
 if p_action is null or p_request is null or p_reason is null or char_length(btrim(p_reason)) not between 8 and 500 or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then raise exception 'ADMIN_INVALID';end if;
 request_hash=md5(p_action||coalesce(p_target::text,'')||p_payload::text||p_reason);
 select * into previous from public.platform_audit where id=p_request;
 if found then if previous.actor_id<>p_actor or previous.request_hash<>request_hash then raise exception 'ADMIN_DUPLICATE';end if;return previous.result;end if;
 if p_action in('admin_role','credits','user_suspend','settings','project_delete') and actor_role<>'superadmin' then raise exception 'ADMIN_FORBIDDEN' using errcode='42501';end if;
 case p_action
 when 'admin_role' then
 if not exists(select 1 from auth.users where id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 v_role=p_payload->>'role';if v_role not in('superadmin','operator','auditor','remove') or v_role is null then raise exception 'ADMIN_INVALID';end if;
 if exists(select 1 from public.platform_admins where user_id=p_target and role='superadmin') and v_role<>'superadmin' and (select count(*) from public.platform_admins where role='superadmin')<=1 then raise exception 'ADMIN_LAST_SUPERADMIN';end if;
 if v_role<>'remove' and not public.piwu_user_active(p_target) then raise exception 'ADMIN_INVALID';end if;
 if v_role='remove' then delete from public.platform_admins where user_id=p_target;
 else insert into public.platform_admins(user_id,role,granted_by) values(p_target,v_role,p_actor) on conflict(user_id) do update set role=excluded.role,granted_by=p_actor;end if;
 when 'user_suspend' then
 if not exists(select 1 from auth.users where id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 if p_payload->>'suspended' not in('true','false') or p_payload->>'suspended' is null then raise exception 'ADMIN_INVALID';end if;
 if exists(select 1 from public.platform_admins where user_id=p_target) then raise exception 'ADMIN_REMOVE_ROLE_FIRST';end if;
 insert into public.platform_user_controls(user_id,suspended,reason) values(p_target,(p_payload->>'suspended')::boolean,p_reason) on conflict(user_id) do update set suspended=excluded.suspended,reason=excluded.reason,updated_at=now();
 when 'credits' then
 if jsonb_typeof(p_payload->'delta') is distinct from 'number' then raise exception 'ADMIN_INVALID';end if;
 delta=(p_payload->>'delta')::integer;if delta=0 or abs(delta)>10000 or delta::numeric<>(p_payload->>'delta')::numeric then raise exception 'ADMIN_INVALID';end if;
 perform public.piwu_ensure_credits(p_target);select balance into bal from public.credit_accounts where user_id=p_target for update;
 if bal+delta<0 then raise exception 'ADMIN_NEGATIVE_BALANCE';end if;
 if delta>0 then perform public.piwu_grant_credits(p_target,delta,'admin','Penyesuaian admin: '||p_reason,null,'admin:'||p_request);
 else perform public.piwu_revoke_credits(p_target,-delta,'Penyesuaian admin: '||p_reason,'admin:'||p_request);end if;
 result=jsonb_build_object('balance',bal+delta);
 when 'project_lock' then
 if not exists(select 1 from public.projects where id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 if p_payload->>'locked' not in('true','false') or p_payload->>'locked' is null then raise exception 'ADMIN_INVALID';end if;
 insert into public.platform_project_controls(project_id,locked,reason) values(p_target,(p_payload->>'locked')::boolean,p_reason) on conflict(project_id) do update set locked=excluded.locked,reason=excluded.reason,updated_at=now();
 when 'project_delete' then
 for job_record in select id,status from public.publish_jobs where project_id=p_target and status in('queued','building') for update loop
 if job_record.status='building' then raise exception 'ADMIN_CONFLICT';end if;
 perform public.piwu_finish_credits(job_record.id,false);
 end loop;
 if p_payload->>'confirmation' is distinct from p_target::text then raise exception 'ADMIN_INVALID';end if;
 delete from public.projects where id=p_target;if not found then raise exception 'ADMIN_NOT_FOUND';end if;
 when 'template_status' then
 if p_payload->>'status' not in('published','archived') or p_payload->>'status' is null then raise exception 'ADMIN_INVALID';end if;
 update public.templates set status=p_payload->>'status' where id=p_target;if not found then raise exception 'ADMIN_NOT_FOUND';end if;
 when 'recording_revoke' then
 if not exists(select 1 from public.recording_shares where recording_id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 update public.recording_shares set revoked_at=now() where recording_id=p_target and revoked_at is null;
 when 'publish_cancel' then
 perform 1 from public.publish_jobs where id=p_target and status='queued' for update;if not found then raise exception 'ADMIN_CONFLICT';end if;
 update public.publish_jobs set status='failed',error='Dibatalkan administrator.',updated_at=now() where id=p_target;perform public.piwu_finish_credits(p_target,false);
 when 'hosting_retry' then
 update public.hosting_cleanup_jobs set attempts=0,error=null where id=p_target;if not found then raise exception 'ADMIN_NOT_FOUND';end if;
 when 'unpublish' then
 perform 1 from public.publish_jobs where project_id=p_target and status in('queued','building') for update;
 if found then raise exception 'ADMIN_CONFLICT';end if;
 if not exists(select 1 from public.project_sites where project_id=p_target) then raise exception 'ADMIN_NOT_FOUND';end if;
 insert into public.platform_project_controls(project_id,locked,reason) values(p_target,true,p_reason) on conflict(project_id) do update set locked=true,reason=p_reason,updated_at=now();
 delete from public.project_sites where project_id=p_target;update public.deployments set status='unpublish_queued' where project_id=p_target and status='ready';result='{"queued":true}';
 when 'payment_reconcile' then
 result=jsonb_build_object('status',public.piwu_apply_payment(p_target,(p_payload->>'amount')::integer,p_payload->>'currency',p_payload->>'state'));
 when 'broadcast_save' then
 if p_target is null or char_length(coalesce(p_payload->>'title','')) not between 1 and 120 or char_length(coalesce(p_payload->>'body','')) not between 1 and 4000 or p_payload->>'audience' not in('public','members','pro','team') or p_payload->>'status' not in('draft','published','archived') or p_payload->>'revision' is null then raise exception 'ADMIN_INVALID';end if;
 select revision into rev from public.platform_broadcasts where id=p_target for update;
 if coalesce(rev,0)<>(p_payload->>'revision')::bigint then raise exception 'ADMIN_CONFLICT';end if;
 insert into public.platform_broadcasts(id,title,body,audience,status,starts_at,ends_at,created_by) values(p_target,p_payload->>'title',p_payload->>'body',p_payload->>'audience',p_payload->>'status',(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,p_actor)
 on conflict(id) do update set title=excluded.title,body=excluded.body,audience=excluded.audience,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,revision=public.platform_broadcasts.revision+1,updated_at=now();
 result=jsonb_build_object('revision',coalesce(rev,0)+1);
 when 'settings' then
 select revision into rev from public.site_configuration where id for update;
 if p_payload->>'revision' is null or rev<>(p_payload->>'revision')::bigint then raise exception 'ADMIN_CONFLICT';end if;
 if jsonb_typeof(p_payload->'value') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload->'value') k where k not in('maintenance','maintenance_message','hero_title','hero_subtitle','support_email','enabled_services')) then raise exception 'ADMIN_INVALID';end if;
 if jsonb_typeof(p_payload->'value'->'maintenance') is distinct from 'boolean' then raise exception 'ADMIN_INVALID';end if;
 update public.site_configuration set value=p_payload->'value',revision=revision+1,updated_at=now() where id;result=jsonb_build_object('revision',rev+1);
 else raise exception 'ADMIN_INVALID';end case;
 insert into public.platform_audit(id,actor_id,action,target_id,reason,request_hash,result) values(p_request,p_actor,p_action,p_target,p_reason,request_hash,result);
 return result;
end;$$;
create or replace function public.piwu_recover_credits() returns void language plpgsql security definer set search_path='' as $$
declare r record;begin
 update public.publish_jobs set status='failed',error='Antrean publish kedaluwarsa; silakan coba kembali.',updated_at=now() where status='queued' and created_at<now()-interval '1 hour';
 for r in select c.id from public.credit_reservations c where c.status='reserved' and c.created_at<now()-interval '35 minutes' and not exists(select 1 from public.publish_jobs j where j.id=c.id and j.status in('queued','building')) loop
 perform public.piwu_finish_credits(r.id,exists(select 1 from public.publish_jobs j where j.id=r.id and j.status='ready'));
 end loop;
 perform public.piwu_expire_credits();
 delete from public.analytics_events where created_at<now()-interval '31 days';
end;$$;

revoke all on function public.piwu_grant_credits(uuid,integer,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.piwu_revoke_credits(uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.piwu_claim_daily(uuid) from public,anon,authenticated;
revoke all on function public.piwu_credit_status(uuid) from public,anon,authenticated;
revoke all on function public.piwu_expire_credits() from public,anon,authenticated;
revoke all on function public.piwu_credit_policy() from public,anon,authenticated;
revoke all on function public.piwu_lot_expiry(text,timestamptz) from public,anon,authenticated;
grant execute on function public.piwu_grant_credits(uuid,integer,text,text,timestamptz,text) to service_role;
grant execute on function public.piwu_revoke_credits(uuid,integer,text,text) to service_role;
grant execute on function public.piwu_claim_daily(uuid) to service_role;
grant execute on function public.piwu_credit_status(uuid) to service_role;
grant execute on function public.piwu_expire_credits() to service_role;
grant execute on function public.piwu_credit_policy() to service_role;
grant execute on function public.piwu_lot_expiry(text,timestamptz) to service_role;
grant all on public.credit_lots to service_role;

notify pgrst, 'reload schema';
commit;

select 'Instalasi skema 001–010 selesai. Jalankan CHECK_INSTALLATION.sql, lalu bootstrap admin secara terpisah.' as hasil;
