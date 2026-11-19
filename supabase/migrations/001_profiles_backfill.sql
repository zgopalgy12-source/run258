-- Fase 1: executar uma vez no SQL Editor, depois do schema.sql original.
-- Cria apenas os perfis em falta; preserva os perfis e administradores existentes.
begin;
insert into public.profiles (id, name)
select id, coalesce(nullif(btrim(raw_user_meta_data->>'full_name'), ''),
  nullif(split_part(email, '@', 1), ''), 'Membro Run 258')
from auth.users
on conflict (id) do nothing;
commit;
