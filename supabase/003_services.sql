-- Apply after 001 and 002. All service mutations require the backend service role.
-- Never expose the service-role key in a VITE_* variable or browser bundle.
begin;
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
commit;
