-- Platform administration. Apply once after 001–004. Bootstrap the first
-- superadmin manually with a real, verified auth.users ID; never trust metadata.
begin;
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
commit;
