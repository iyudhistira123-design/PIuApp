-- Apply after 001_schema.sql. Atomic workspace snapshots with optimistic locks.
-- Cloud notebooks are user-editable state, NOT trusted assistant/audit records.
begin;
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
commit;
