-- Managed project datasets, not arbitrary SQL/DDL or public application data.
-- Apply once after migrations 001–003.
begin;
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
commit;
