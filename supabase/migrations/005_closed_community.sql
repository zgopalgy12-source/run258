begin;
-- Comunidade fechada: executar depois da fase 4. Seguro repetir.
-- Preserva os GRANT e as condicoes das politicas para authenticated.

do $$
declare
  table_name text;
  current_policy record;
  remaining_roles text;
  anonymous_role oid := 'anon'::regrole;
begin
  foreach table_name in array array[
    'profiles','activities','follows','channels','messages','reactions','events',
    'announcements','anuncios'
  ] loop
    if to_regclass(format('public.%I',table_name)) is null then
      continue;
    end if;
    execute format('revoke all privileges on table public.%I from anon',table_name);
    -- REVOKE na tabela tambem revoga os privilegios de coluna de anon.
    execute format('alter table public.%I enable row level security',table_name);
    -- Se uma politica misturava anon e authenticated, remove so anon da lista.
    for current_policy in select p.polname,p.polroles from pg_policy p
      where p.polrelid = to_regclass(format('public.%I',table_name))
        and anonymous_role = any(p.polroles)
    loop
      select string_agg(case when role_id = 0 then 'public'
        else quote_ident(pg_get_userbyid(role_id)) end, ', ')
      into remaining_roles from unnest(current_policy.polroles) role_id
      where role_id <> anonymous_role;
      if remaining_roles is null then
        execute format('drop policy %I on public.%I',current_policy.polname,table_name);
      else
        execute format('alter policy %I on public.%I to %s',current_policy.polname,table_name,remaining_roles);
      end if;
    end loop;
    -- A barreira restritiva tambem cobre permissoes/politicas herdadas de PUBLIC.
    execute format('drop policy if exists run258_no_anon on public.%I',table_name);
    execute format('create policy run258_no_anon on public.%I as restrictive for all to anon using (false) with check (false)',table_name);
  end loop;
end;
$$;

-- As RPC que devolvem dados da comunidade ja sao SECURITY INVOKER.
revoke all privileges on function public.member_directory(integer,integer) from anon;
revoke all privileges on function public.chat_reaction_summary(uuid[]) from anon;

-- Sem acesso anonimo aos metadados/ficheiros de Storage.
-- Nao se altera a RLS gerida pelo Supabase nem se revogam GRANT de authenticated.
revoke all privileges on all tables in schema storage from anon;
revoke usage on schema storage from anon;
do $$
declare
  current_policy record;
  remaining_roles text;
  table_name text;
  anonymous_role oid := 'anon'::regrole;
begin
  foreach table_name in array array['objects','buckets'] loop
    for current_policy in select p.polname,p.polroles from pg_policy p
      where p.polrelid = to_regclass(format('storage.%I',table_name))
        and anonymous_role = any(p.polroles)
    loop
      select string_agg(case when role_id = 0 then 'public'
        else quote_ident(pg_get_userbyid(role_id)) end, ', ')
      into remaining_roles from unnest(current_policy.polroles) role_id
      where role_id <> anonymous_role;
      if remaining_roles is null then
        execute format('drop policy %I on storage.%I',current_policy.polname,table_name);
      else
        execute format('alter policy %I on storage.%I to %s',current_policy.polname,table_name,remaining_roles);
      end if;
    end loop;
    execute format('drop policy if exists run258_no_anon on storage.%I',table_name);
    execute format('create policy run258_no_anon on storage.%I as restrictive for all to anon using (false) with check (false)',table_name);
  end loop;
end;
$$;

-- Downloads publicos ignoram RLS: os tres buckets da comunidade ficam privados.
update storage.buckets set public = false
where id in ('avatars','activity-photos','photos');

-- Nenhum GRANT nem politica de authenticated e removido; nao ha tabelas novas.
notify pgrst, 'reload schema';
commit;
