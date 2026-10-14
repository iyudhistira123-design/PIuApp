-- Search the real auth directory without returning credentials/tokens or arbitrary metadata.
begin;
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
commit;
