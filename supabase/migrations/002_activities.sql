-- Fase 2: executar depois do esquema original. Seguro repetir.
begin;
-- Automatically expose new tables desativado: permissoes explicitas.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on table public.activities to authenticated;
grant select on table public.activities to anon;
-- A RLS existente continua a controlar as linhas e operacoes permitidas.
-- A consulta pessoal filtra por user_id; a politica de leitura comunitaria
-- do esquema original nao e alterada nesta fase.
alter table public.activities enable row level security;
create index if not exists activities_user_date_id_idx
  on public.activities (user_id, date desc, id desc);
-- Sem novas tabelas, sequences ou funcoes: IDs usam UUID, como no esquema.
commit;
