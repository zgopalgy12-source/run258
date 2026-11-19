-- Fase 4: chat em tempo real. Executar depois das fases 1, 2 e 3. Seguro repetir.
begin;

grant usage on schema public to authenticated, anon;

-- Canais reais, preservando os IDs e mensagens existentes.
insert into public.channels (name) values ('geral'), ('vitórias'), ('momentos'), ('eventos')
on conflict (name) do nothing;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;
revoke all privileges on table public.channels, public.messages, public.reactions from anon;
revoke insert, update, delete, truncate, references, trigger on public.channels from authenticated;
grant select on public.channels, public.messages, public.reactions, public.profiles, public.activities to authenticated;
grant delete on public.messages to authenticated;
revoke truncate, references, trigger on public.messages from authenticated;
grant execute on function public.is_admin() to authenticated;

-- Cartao historico: os dados sao calculados pelo servidor, nao pelo cliente.
alter table public.messages add column if not exists activity_card jsonb;
revoke insert, update on public.messages from public, anon, authenticated;
revoke insert (id, channel_id, author_id, body, photo_url, activity_id, reply_to, pinned, created_at, activity_card)
  on public.messages from public, anon, authenticated;
revoke update (id, channel_id, author_id, body, photo_url, activity_id, reply_to, pinned, created_at, activity_card)
  on public.messages from public, anon, authenticated;
grant insert (id, channel_id, author_id, body, photo_url, activity_id, reply_to)
  on public.messages to authenticated;
-- A politica existente de administrador controla a fixacao. Sem edicao de autoria/conteudo.
grant update (pinned) on public.messages to authenticated;

create or replace function public.prepare_chat_message()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.body := btrim(coalesce(new.body, ''));
  if char_length(new.body) > 4000 then
    raise exception 'A mensagem pode ter ate 4000 caracteres.' using errcode = '23514';
  end if;
  if new.activity_id is not null then
    select jsonb_build_object('type', a.type, 'distance', a.distance,
      'duration', a.duration, 'date', a.date)
    into new.activity_card from public.activities a
    where a.id = new.activity_id and a.user_id = new.author_id;
    if not found then
      raise exception 'So podes partilhar uma atividade da tua conta.' using errcode = '23514';
    end if;
  else
    new.activity_card := null;
  end if;
  if new.reply_to is not null and not exists (
    select 1 from public.messages parent
    where parent.id = new.reply_to and parent.channel_id = new.channel_id
  ) then
    raise exception 'A resposta tem de referir uma mensagem do mesmo canal.' using errcode = '23514';
  end if;
  if new.photo_url is not null and new.photo_url !~ (
    '^storage://photos/' || new.author_id::text || '/[0-9a-f-]{36}[.]jpg$'
  ) then
    raise exception 'A foto deve pertencer a tua pasta no bucket photos.' using errcode = '23514';
  end if;
  if new.body = '' and new.photo_url is null and new.activity_card is null then
    raise exception 'A mensagem precisa de texto, foto ou atividade.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all privileges on function public.prepare_chat_message() from public, anon;
grant execute on function public.prepare_chat_message() to authenticated;
drop trigger if exists run258_prepare_chat_message on public.messages;
create trigger run258_prepare_chat_message before insert on public.messages
  for each row execute function public.prepare_chat_message();

drop policy if exists channels_read on public.channels;
create policy channels_read on public.channels for select to authenticated using (true);
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (true);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = (select auth.uid()) and pinned = false);
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());
drop policy if exists messages_admin_update on public.messages;
create policy messages_admin_update on public.messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke update, truncate, references, trigger on public.reactions from authenticated;
grant insert, delete on public.reactions to authenticated;
drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions for select to authenticated using (true);
drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and emoji in ('🔥','👏','💪'));
drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Agregacao no servidor: contagens completas, mesmo acima do limite da Data API.
create or replace function public.chat_reaction_summary(p_message_ids uuid[])
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  from (
    select message_id, emoji, count(*) as total,
      bool_or(user_id = (select auth.uid())) as mine
    from public.reactions
    where message_id = any(coalesce(p_message_ids, '{}'::uuid[]))
    group by message_id, emoji
  ) r;
$$;
revoke all privileges on function public.chat_reaction_summary(uuid[]) from public, anon;
grant execute on function public.chat_reaction_summary(uuid[]) to authenticated;

create index if not exists messages_channel_created_id_idx
  on public.messages (channel_id, created_at desc, id desc);
create index if not exists messages_reply_to_idx on public.messages (reply_to);
create index if not exists messages_photo_url_idx on public.messages (photo_url)
  where photo_url is not null;

-- Reutiliza o bucket photos existente, agora com limites explicitos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 1048576, array['image/jpeg'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant execute on function storage.foldername(text) to authenticated;
drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.messages m
      where m.photo_url = 'storage://photos/' || storage.objects.name)
  ));
drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and
    name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]jpg$'));
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Sem politica UPDATE no bucket photos: uploads com nomes unicos e upsert:false.

-- A publication pode ja existir e conter messages/reactions desde o esquema original.
do $$
declare item text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    foreach item in array array['messages','reactions','profiles'] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = item) then
        execute format('alter publication supabase_realtime add table public.%I', item);
      end if;
    end loop;
  end if;
end;
$$;
-- O cliente recarrega o canal nos DELETE, sem depender dos campos antigos do payload.
alter table public.messages replica identity full;
alter table public.reactions replica identity full;

notify pgrst, 'reload schema';
commit;
