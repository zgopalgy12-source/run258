begin;
-- Fase 5: administracao e moderacao. Executar depois de comunidade-fechada.sql.

-- Preserva administradores existentes e faz de role a fonte de verdade.
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role') then
    alter table public.profiles add column role text not null default 'member';
    update public.profiles set role='admin' where is_admin=true;
  end if;
end $$;
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists moderation_reason text;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check check(role in ('member','admin'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_status_check') then
    alter table public.profiles add constraint profiles_status_check check(status in ('active','suspended','removed'));
  end if;
end $$;
update public.profiles set is_admin=(role='admin') where is_admin is distinct from (role='admin');

create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and status='active');
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and status='active');
$$;
-- Apenas estado e papel da propria conta, mesmo quando o acesso esta bloqueado.
create or replace function public.community_access() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('role',role,'status',status) from public.profiles where id=(select auth.uid());
$$;
revoke all on function public.is_active_member(),public.is_admin(),public.community_access() from public,anon;
grant execute on function public.is_active_member(),public.is_admin(),public.community_access() to authenticated;

-- ACL por coluna + RLS + trigger: nem UPDATE acidentalmente alargado permite escalar o papel.
revoke insert,update,delete on public.profiles from public,anon,authenticated;
revoke insert(id,name,bio,avatar_url,is_admin,created_at,role,status,moderation_reason),
  update(id,name,bio,avatar_url,is_admin,created_at,role,status,moderation_reason)
  on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;
grant update(name,bio,avatar_url) on public.profiles to authenticated;
create or replace function public.guard_profile_access() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' then
      if new.role<>'member' or new.status<>'active' or new.is_admin then
        raise exception 'Nao podes definir o papel ou estado da conta.' using errcode='42501';
      end if;
    elsif new.role is distinct from old.role or new.status is distinct from old.status
      or new.is_admin is distinct from old.is_admin or new.id is distinct from old.id
      or new.moderation_reason is distinct from old.moderation_reason then
      raise exception 'O papel e o estado da conta nao podem ser alterados pelo cliente.' using errcode='42501';
    end if;
  end if;
  new.is_admin := new.role='admin';
  return new;
end $$;
revoke all on function public.guard_profile_access() from public,anon;
grant execute on function public.guard_profile_access() to authenticated;
drop trigger if exists run258_guard_profile_access on public.profiles;
create trigger run258_guard_profile_access before insert or update on public.profiles
for each row execute function public.guard_profile_access();

create table if not exists public.announcements(
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(btrim(title)) between 1 and 120),
  body text not null check(char_length(btrim(body)) between 1 and 5000),
  pinned boolean not null default false,
  author_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
revoke all on public.announcements from public,anon,authenticated;
grant select,delete on public.announcements to authenticated;
grant insert(title,body,pinned,author_id) on public.announcements to authenticated;
grant update(title,body,pinned) on public.announcements to authenticated;
create or replace function public.touch_announcement() returns trigger
language plpgsql security invoker set search_path='' as $$ begin new.updated_at=now();return new;end $$;
revoke all on function public.touch_announcement() from public,anon;
grant execute on function public.touch_announcement() to authenticated;
drop trigger if exists run258_touch_announcement on public.announcements;
create trigger run258_touch_announcement before update on public.announcements
for each row execute function public.touch_announcement();
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated using((select public.is_active_member()));
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert to authenticated
with check((select public.is_admin()) and author_id=(select auth.uid()));
drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements for update to authenticated
using((select public.is_admin())) with check((select public.is_admin()));
drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements for delete to authenticated using((select public.is_admin()));

-- Gate em todas as operacoes: bloqueia tambem tokens ainda validos de contas suspensas/removidas.
do $$ declare item text; begin
  foreach item in array array['profiles','activities','follows','channels','messages','reactions','events','announcements'] loop
    execute format('alter table public.%I enable row level security',item);
    execute format('revoke all on public.%I from anon',item);
    execute format('drop policy if exists run258_active_member on public.%I',item);
    execute format('create policy run258_active_member on public.%I as restrictive for all to authenticated using ((select public.is_active_member())) with check ((select public.is_active_member()))',item);
    execute format('drop policy if exists run258_no_anon on public.%I',item);
    execute format('create policy run258_no_anon on public.%I as restrictive for all to anon using(false) with check(false)',item);
  end loop;
  foreach item in array array['objects','buckets'] loop
    execute format('drop policy if exists run258_active_member on storage.%I',item);
    execute format('create policy run258_active_member on storage.%I as restrictive for all to authenticated using ((select public.is_active_member())) with check ((select public.is_active_member()))',item);
  end loop;
end $$;
drop policy if exists run258_visible_member on public.profiles;
create policy run258_visible_member on public.profiles as restrictive for select to authenticated
using(status='active' or (select public.is_admin()));
drop policy if exists run258_visible_follows on public.follows;
create policy run258_visible_follows on public.follows as restrictive for select to authenticated
using(exists(select 1 from public.profiles p where p.id=follower_id and p.status='active')
  and exists(select 1 from public.profiles p where p.id=following_id and p.status='active'));

-- Apenas perfis ativos entram no diretorio e podem receber novos follows.
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
with check(follower_id=(select auth.uid()) and follower_id<>following_id
  and exists(select 1 from public.profiles p where p.id=following_id and p.status='active'));
create or replace function public.member_directory(p_limit integer default 24,p_offset integer default 0)
returns table(id uuid,name text,bio text,avatar_url text,follower_count bigint,following_count bigint,is_following boolean)
language sql stable security invoker set search_path='' as $$
 select p.id,p.name,p.bio,p.avatar_url,
   (select count(*) from public.follows f where f.following_id=p.id),
   (select count(*) from public.follows f where f.follower_id=p.id),
   exists(select 1 from public.follows f where f.follower_id=(select auth.uid()) and f.following_id=p.id)
 from public.profiles p where p.status='active' order by p.name,p.id
 limit least(greatest(coalesce(p_limit,24),1),100) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.member_directory(integer,integer) from public,anon;
grant execute on function public.member_directory(integer,integer) to authenticated;

-- Eventos: membros leem, apenas administradores ativos criam/editam/apagam.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.events'::regclass and conname='events_content_valid') then
   alter table public.events add constraint events_content_valid check(
     char_length(btrim(name)) between 1 and 150 and char_length(btrim(location)) between 1 and 300
     and char_length(description)<=5000) not valid;
 end if;
end $$;
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.events to authenticated;
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using((select public.is_active_member()));
drop policy if exists events_admin on public.events;
create policy events_admin on public.events for all to authenticated
using((select public.is_admin())) with check((select public.is_admin()));

-- Moderacao de mensagens: colunas de autoria/conteudo continuam protegidas.
grant select,delete on public.messages to authenticated;
revoke update on public.messages from authenticated;
grant update(pinned) on public.messages to authenticated;
drop policy if exists messages_admin_update on public.messages;
create policy messages_admin_update on public.messages for update to authenticated
using((select public.is_admin())) with check((select public.is_admin()));
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
using(author_id=(select auth.uid()) or (select public.is_admin()));
-- Limpeza de fotos de mensagens apagadas por um admin, via Storage API (nao SQL).
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
drop policy if exists run258_admin_media_read on storage.objects;
create policy run258_admin_media_read on storage.objects for select to authenticated
using(bucket_id in ('avatars','activity-photos','photos') and (select public.is_admin()));
drop policy if exists run258_admin_media_delete on storage.objects;
create policy run258_admin_media_delete on storage.objects for delete to authenticated
using(bucket_id in ('avatars','activity-photos','photos') and (select public.is_admin()));

-- RPCs privilegiadas: ator sempre auth.uid(), nunca um ID recebido do cliente.
create or replace function public.admin_list_members(p_limit integer default 24,p_offset integer default 0,p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
  if not public.is_admin() then raise exception 'Apenas administradores.' using errcode='42501';end if;
  select jsonb_build_object('items',coalesce((
    select jsonb_agg(to_jsonb(m)) from (
      select p.id,p.name,p.bio,p.avatar_url,u.email,p.role,p.status,p.moderation_reason,p.created_at
      from public.profiles p left join auth.users u on u.id=p.id
      where p.name ilike '%'||left(coalesce(p_search,''),100)||'%'
        or u.email ilike '%'||left(coalesce(p_search,''),100)||'%'
      order by p.created_at desc,p.id
      limit least(greatest(coalesce(p_limit,24),1),100) offset greatest(coalesce(p_offset,0),0)
    ) m
  ),'[]'::jsonb),'total',(
    select count(*) from public.profiles p left join auth.users u on u.id=p.id
    where p.name ilike '%'||left(coalesce(p_search,''),100)||'%'
      or u.email ilike '%'||left(coalesce(p_search,''),100)||'%'
  )) into result;
  return result;
end $$;
create or replace function public.admin_moderate_member(p_target uuid,p_status text,p_reason text default '')
returns void language plpgsql security definer set search_path='' as $$
declare target_role text;begin
  if not public.is_admin() then raise exception 'Apenas administradores.' using errcode='42501';end if;
  if p_target=(select auth.uid()) then raise exception 'Nao podes moderar a tua propria conta.' using errcode='42501';end if;
  if p_status not in ('active','suspended','removed') or p_status is null then raise exception 'Estado invalido.' using errcode='23514';end if;
  if char_length(coalesce(p_reason,''))>500 then raise exception 'Motivo demasiado longo.' using errcode='23514';end if;
  select role into target_role from public.profiles where id=p_target for update;
  if not found then raise exception 'Membro nao encontrado.' using errcode='P0002';end if;
  if target_role='admin' then raise exception 'O papel de administrador so e gerido no SQL Editor.' using errcode='42501';end if;
  update public.profiles set status=p_status,moderation_reason=nullif(btrim(p_reason),'') where id=p_target;
  if p_status='removed' then
    delete from public.follows where follower_id=p_target or following_id=p_target;
  end if;
end $$;
revoke all on function public.admin_list_members(integer,integer,text),public.admin_moderate_member(uuid,text,text) from public,anon;
grant execute on function public.admin_list_members(integer,integer,text),public.admin_moderate_member(uuid,text,text) to authenticated;

create index if not exists announcements_pinned_created_idx on public.announcements(pinned desc,created_at desc);
create index if not exists profiles_status_role_idx on public.profiles(status,role);
create index if not exists messages_channel_pinned_idx on public.messages(channel_id,pinned,created_at desc);
-- Realtime para os quadros dos membros e moderacao; os restantes ja foram ativados.
do $$ declare item text;begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime;end if;
  if not exists(select 1 from pg_publication where pubname='supabase_realtime' and puballtables) then
    foreach item in array array['profiles','messages','reactions','events','announcements'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=item) then
        execute format('alter publication supabase_realtime add table public.%I',item);
      end if;
    end loop;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
