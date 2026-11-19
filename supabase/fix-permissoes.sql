-- Run 258: executar no SQL Editor do Supabase depois de schema.sql.
-- Aplica-se aos objetos existentes. Pode ser repetido.
-- Nao altera politicas RLS nem permissoes por defeito para objetos futuros.
begin;

-- Permite resolver os objetos do schema atraves da API.
grant usage on schema public to anon, authenticated;

-- Operacoes de dados sujeitas as politicas RLS existentes.
-- Nao concede TRUNCATE, que nao e protegido por RLS.
grant select, insert, update, delete
  on all tables in schema public to anon, authenticated;

-- Permite usar identificadores gerados por sequences.
grant usage, select
  on all sequences in schema public to anon, authenticated;

-- Inclui is_admin(), usada nas politicas existentes.
grant execute
  on all functions in schema public to anon, authenticated;

-- Preserva a restricao original de profiles: cada utilizador so pode
-- atualizar nome, bio e avatar; a RLS continua a limitar a sua propria linha.
revoke update on table public.profiles from public, anon, authenticated;
revoke update (id, name, bio, avatar_url, is_admin, created_at)
  on table public.profiles from public, anon, authenticated;
grant update (name, bio, avatar_url)
  on table public.profiles to authenticated;

commit;
