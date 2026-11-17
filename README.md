# Run 258

Protótipo de aplicação para a comunidade Run 258, em Next.js, TypeScript e Tailwind. A interface inclui dados de demonstração e ainda não constitui uma aplicação de produção completa: atividades e mensagens são guardadas apenas no estado do navegador durante a sessão; perfil, seguidores, galeria, carregamento de fotos, moderação e administração ainda precisam de ser ligados ao Supabase. Os totais e o gráfico do painel usam dados ilustrativos. Não usar para dados reais até concluir e testar essas integrações.

## Estrutura e modelo

- `app/`: interface e estilos; `lib/`: cliente Supabase; `public/`: espaço para o logótipo; `supabase/`: esquema e seed.
- `profiles` contém dados de membros e papel administrativo; `activities` pertence a um perfil e tem campos `source`/`external_id` reservados para futura integração Strava; `follows` relaciona dois perfis; `channels` agrupa `messages`; `reactions` liga utilizadores a mensagens; `events` guarda encontros.

## Configuração local

1. Instalar Node.js 20+ e executar `npm install`.
2. Copiar `.env.example` para `.env.local` e preencher o URL e a chave pública anon do Supabase. Nunca colocar a chave service role no browser.
3. Num projecto Supabase novo, executar `supabase/schema.sql` e depois `supabase/seed.sql` no SQL Editor. Activar email/palavra-passe em Authentication. Para Google, activar o provider e configurar as credenciais OAuth e os URLs de redirecionamento no Supabase e Google Cloud.
4. Executar `npm run dev` e abrir http://localhost:3000. Colocar o logótipo oficial em `public/` e substituir o componente `Logo` quando o ficheiro estiver disponível.
5. Para criar um administrador, actualizar `profiles.is_admin` pelo SQL Editor, usando o UUID do utilizador. Não permitir que clientes alterem este campo.

## Testar por fase

- **(a) Base, autenticação e landing:** abrir Início, verificar ritmos e evento, e testar criação de conta/entrada com as credenciais Supabase configuradas. Google exige configuração OAuth.
- **(b) Painel e atividades:** no Painel, mudar filtros e semana; registar uma atividade e confirmar que aparece na lista. Actualmente é temporária e os totais são demonstrativos.
- **(c) Perfil:** abrir Perfil e mudar separadores. Edição e seguidores ainda não estão ligados.
- **(d) Chat:** mudar canais e enviar uma mensagem de demonstração. A persistência, canais independentes e Realtime ainda não estão ligados.
- **(e) Admin:** o esquema contempla o papel de administrador e políticas, mas a interface de administração ainda não foi implementada.

## Deploy Vercel

Importar o repositório na Vercel, definir as variáveis de `.env.example`, fazer deploy e adicionar o domínio aos URLs permitidos em Supabase Auth e Google OAuth. Execute `npm run build` antes de publicar. A publicação deve aguardar a conclusão e testes das integrações indicadas acima.
