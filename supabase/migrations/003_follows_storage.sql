-- Fase 3: executar depois das fases 1 e 2. Seguro repetir.
begin;

grant usage on schema public to authenticated, anon;
grant select on table public.profiles, public.activities to authenticated;
grant update (name, bio, avatar_url) on table public.profiles to authenticated;
grant insert, update on table public.activities to authenticated;

-- Seguidores: leitura comunitaria; so o proprio pode seguir/deixar de seguir.
alter table public.follows enable row level security;
revoke all privileges on table public.follows from anon;
revoke update, truncate, references, trigger on table public.follows from authenticated;
grant select, insert, delete on table public.follows to authenticated;
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()) and follower_id <> following_id);
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));
create index if not exists follows_following_idx on public.follows (following_id);

-- Contagens exatas e paginacao no servidor, sem limites de linhas da Data API.
-- SECURITY INVOKER: respeita as permissoes e RLS do utilizador autenticado.
create or replace function public.member_directory(p_limit integer default 24, p_offset integer default 0)
returns table (id uuid, name text, bio text, avatar_url text,
  follower_count bigint, following_count bigint, is_following boolean)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.name, p.bio, p.avatar_url,
    (select count(*) from public.follows f where f.following_id = p.id),
    (select count(*) from public.follows f where f.follower_id = p.id),
    exists (select 1 from public.follows f
      where f.follower_id = (select auth.uid()) and f.following_id = p.id)
  from public.profiles p
  order by p.name, p.id
  limit least(greatest(coalesce(p_limit,24),1),100)
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all privileges on function public.member_directory(integer, integer) from public, anon;
grant execute on function public.member_directory(integer, integer) to authenticated;

-- Buckets privados. O frontend reencodifica sempre para JPEG antes do upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 262144, array['image/jpeg']),
  ('activity-photos', 'activity-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Indices para a verificacao das referencias nas politicas de leitura.
create index if not exists profiles_avatar_url_idx on public.profiles (avatar_url)
  where avatar_url is not null;
create index if not exists activities_photo_url_idx on public.activities (photo_url)
  where photo_url is not null;

-- GRANT explicitos; RLS de storage.objects ja e gerida pelo Supabase.
-- Clientes nao recebem permissoes para criar/alterar buckets.
grant usage on schema storage to authenticated;
grant select, insert, delete on table storage.objects to authenticated;
grant execute on function storage.foldername(text) to authenticated;

-- Avatares: dono pode ler o seu upload ainda nao associado; membros podem
-- ler avatares associados a perfis. Nao ha leitura anonima.
drop policy if exists run258_avatars_read on storage.objects;
create policy run258_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.profiles p
      where p.avatar_url = 'storage://avatars/' || storage.objects.name)
  ));
drop policy if exists run258_avatars_insert on storage.objects;
create policy run258_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and
    name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]jpg$'));
drop policy if exists run258_avatars_delete on storage.objects;
create policy run258_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Fotos de atividades: mesma propriedade; leitura comunitaria so para
-- fotos associadas a atividades visiveis pela RLS de public.activities.
drop policy if exists run258_activity_photos_read on storage.objects;
create policy run258_activity_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'activity-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.activities a
      where a.photo_url = 'storage://activity-photos/' || storage.objects.name)
  ));
drop policy if exists run258_activity_photos_insert on storage.objects;
create policy run258_activity_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-photos' and
    name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]jpg$'));
drop policy if exists run258_activity_photos_delete on storage.objects;
create policy run258_activity_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Sem UPDATE de objetos nestes buckets: usa-se nome unico e upsert:false.
-- Nenhuma sequence nova: IDs e nomes de objetos usam UUID.
-- O bucket legado 'photos' e as suas politicas nao sao modificados.
commit;
