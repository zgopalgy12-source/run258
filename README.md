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

## Fase 1 — perfis ligados ao Supabase

A página Perfil lê `profiles` para o utilizador autenticado e permite atualizar apenas
`name`, `bio` e `avatar_url`. O nome e avatar também aparecem na navegação.
O avatar usa um URL HTTPS nesta fase; o upload para Storage fica para a fase 3.
Os indicadores e atividades fictícios foram retirados da página Perfil. As restantes
áreas continuam a aguardar as respetivas fases.

### SQL

Com o esquema original já instalado, executar
`supabase/migrations/001_profiles_backfill.sql` no SQL Editor. É seguro repetir:
cria apenas perfis em falta para contas anteriores e preserva os dados existentes.
Não voltar a executar o `schema.sql` completo numa base já configurada.
O esquema original já inclui o trigger de criação de perfil, RLS e permissões de
atualização apenas nas colunas editáveis; esta fase não altera essas permissões.

### Testar

1. Em Perfil, iniciar sessão (ou criar uma conta e confirmar o email, se solicitado).
2. Escolher Editar perfil; alterar nome e bio e introduzir o URL HTTPS de uma imagem.
3. Guardar e confirmar a mensagem de sucesso e os novos dados no perfil e na navegação.
4. Recarregar a página; terminar sessão e voltar a entrar: os dados devem manter-se.
5. No Table Editor, verificar `profiles` na linha cujo `id` corresponde ao utilizador em
   Authentication; confirmar `name`, `bio` e `avatar_url`.
6. Apagar o URL do avatar e guardar: devem aparecer as iniciais; com imagem indisponível,
   também devem aparecer as iniciais. Um URL sem HTTPS deve ser recusado.
7. Terminar sessão, entrar com outra conta e confirmar que tem um perfil independente.
8. Para testar falhas, ativar Offline nas ferramentas do navegador antes de guardar:
   deve aparecer um erro, sem confirmação de sucesso; voltar a Online e tentar novamente.

Validação automática: `npx tsc --noEmit`. A persistência e as políticas da instância
Supabase devem ser confirmadas com os passos acima usando contas de teste.

## Fase 2 — atividades persistentes e estatísticas reais

- Registo em `public.activities`, com `user_id` da sessão, duração em segundos,
  distância em km e elevação em metros. Fotos e partilha no chat aguardam as fases seguintes.
- Histórico próprio paginado: a consulta filtra sempre `user_id`, mesmo que a política
  de leitura comunitária permita ler atividades de outros membros.
- Painel e Perfil mostram atividades persistidas; sem sessão, aparece o convite para entrar.
  Falhas de carregamento apresentam erro e botão para repetir, sem apresentar zeros como dados reais.
- Semanas de segunda a domingo, usando a data local do navegador. O gráfico tem 12 semanas
  e termina na semana selecionada. Datas futuras não são aceites pelo formulário.
- O filtro de modalidade aplica-se aos totais históricos, resumo semanal, gráfico, streak,
  recordes e atividades recentes da semana. As páginas de histórico e Perfil mostram todas.
- Streak atual = semanas consecutivas com pelo menos uma atividade. Se a semana atual ainda
  estiver vazia, conta a partir da semana anterior; uma semana completa vazia quebra a série.
  Os sete indicadores mostram os dias com atividade na semana atual, independentemente da
  semana selecionada no resumo.
- Recordes = maior distância numa atividade e menor duração/distância (ritmo médio), em todo
  o histórico do filtro. Sem atividades, os recordes mostram um travessão.

### SQL da fase 2

Executar `supabase/migrations/002_activities.sql` no SQL Editor. Inclui `USAGE` do schema,
GRANT de SELECT/INSERT/UPDATE/DELETE para authenticated e SELECT para anon, ativa RLS e
cria um índice por utilizador/data/id. As políticas existentes continuam a determinar o
acesso efetivo (anon não tem política de leitura de atividades no esquema original).
Não cria novas tabelas, funções ou sequences; não altera permissões de profiles.
É seguro repetir. Não voltar a executar schema.sql nem seed.sql.

### Teste manual com uma conta sem atividades

1. Executar o SQL, recarregar a aplicação e entrar. O Painel deve começar com zeros,
   gráfico vazio, streak 0 e recordes sem valores.
2. Registar estas quatro atividades pelo formulário (datas relativas ao dia do teste):

| Tipo | Data | km | Minutos | Elevação (m) |
| --- | --- | ---: | ---: | ---: |
| Corrida | Hoje | 5 | 30 | 10 |
| Caminhada | Segunda-feira da semana atual | 3 | 36 | 20 |
| Corrida | Segunda-feira da semana anterior | 10 | 50 | 100 |
| Trail Run | Segunda-feira de há duas semanas | 6 | 48 | 60 |

3. Com Todos selecionado, confirmar: histórico 4 atividades, 24 km, 2h44min e 190 m;
   semana atual 8 km, 1h06min e 30 m; comparação -20%; streak 3 semanas;
   recordes 10 km e 5:00/km. O gráfico deve terminar com 6, 10 e 8 km.
4. Selecionar Corrida: histórico 15 km, semana atual 5 km e streak 2. Voltar a Todos.
5. Recuar uma semana: resumo 10 km, 50min, 100 m; gráfico termina em 10 km;
   streak continua a referir-se à data atual. Ver todas e Perfil mostram os quatro registos.
6. Recarregar e terminar/voltar a entrar: confirmar persistência. Em Supabase Table Editor,
   verificar activities, user_id e duration (1800, 2160, 3000, 2880 segundos).
7. Entrar com outra conta: não deve apresentar o histórico pessoal anterior. Sem sessão,
   Registar atividade pede login e o Painel não apresenta estatísticas pessoais.
8. Testar distância/duração zero, elevação negativa e data futura: o formulário deve recusar.
   Em Offline (DevTools), tentar guardar: deve mostrar erro, manter os campos e não mostrar
   sucesso. Repor Online e tentar novamente. No erro de carregamento, usar Tentar novamente.
9. Para testar quebra do streak numa conta de teste, remover no Table Editor a atividade da
   semana anterior e carregar Atualizar: a sequência passa de 3 para 1. Remover também as
   duas atividades da semana atual: a sequência passa para 0, mantendo a atividade antiga.

Se a conta já tiver registos, estes entram nos totais; os valores acima pressupõem uma conta vazia.
Validação automática: `node --test tests/activities.test.cjs` e `npx tsc --noEmit`.
A gravação e as políticas da instância Supabase precisam de validação manual com uma sessão real.

## Fase 3 — seguidores e imagens no Supabase Storage

### SQL a executar

Executar `supabase/migrations/003_follows_storage.sql` no SQL Editor, depois das fases
anteriores. É seguro repetir. Não executar novamente `schema.sql`, `seed.sql` ou
`fix-permissoes.sql` para esta fase. O SQL desta fase inclui os GRANT necessários.

Inclui:

- GRANT explícitos em public para profiles, activities e follows; a proteção de is_admin
  das fases anteriores mantém-se. Em follows, authenticated pode ler, inserir e apagar;
  não recebe UPDATE. anon não recebe acesso a follows.
- RLS de follows: leitura por membros autenticados; inserção e remoção apenas das relações
  em que follower_id é o próprio utilizador. A constraint original impede seguir-se a si
  próprio e a chave primária impede relações duplicadas.
- Função RPC member_directory(integer, integer), com SECURITY INVOKER, paginação e contagens
  reais no servidor. EXECUTE apenas para authenticated, revogado de PUBLIC e anon.
- Buckets PRIVADOS avatars e activity-photos. Só aceitam image/jpeg, com limites de
  262144 bytes (256 KiB) e 1048576 bytes (1 MiB), respetivamente.
- GRANT de USAGE no schema storage e SELECT/INSERT/DELETE em storage.objects para authenticated,
  e EXECUTE no helper storage.foldername(text). Os clientes não criam nem alteram buckets.
- Políticas específicas para cada bucket: INSERT apenas em <auth.uid()>/<uuid>.jpg;
  DELETE apenas na pasta própria; SELECT na pasta própria ou para imagens associadas a
  perfis/atividades visíveis pelas políticas existentes. Não há política UPDATE, pois os
  uploads usam nomes únicos, sem upsert. Não há novas políticas para anon.
- Índices para contagens e referências. Não cria sequences. O bucket antigo photos e
  as respetivas políticas continuam intactos; os novos uploads não o utilizam.

### Comportamento das imagens

Selecionar JPEG, PNG ou WebP até 10 MiB (10485760 bytes). Outros tipos, imagens vazias,
ficheiros ilegíveis e imagens acima de 40 megapíxeis são recusados.
Antes do upload, o navegador corrige a orientação indicada no ficheiro e reencodifica
para JPEG usando canvas, removendo os metadados. Transparência passa a fundo branco.
Avatares: lado maior até 512 px; atividades: até 1920 px. A compressão reduz qualidade e,
se necessário, dimensões até atingir o limite do bucket. A pré-visualização mostra o
resultado e o tamanho final. Não se aumenta a resolução de imagens pequenas.

A base de dados guarda uma referência duradoura storage://bucket/utilizador/uuid.jpg,
nunca um URL assinado temporário. A interface obtém URLs assinados válidos por uma hora
e renova-os aos 45 minutos enquanto o componente estiver montado. Um URL assinado é
um acesso temporário por quem o possui: pode funcionar sem sessão até expirar.
O endereço público não assinado não dá acesso a estes buckets privados.
Avatares antigos definidos por URL HTTPS continuam a funcionar até serem substituídos.

Substituir/remover fotos tenta apagar o ficheiro anterior apenas se já não existir
referência ao mesmo. Se a gravação na base de dados falhar após um upload, o cliente
verifica se o ficheiro foi associado antes de tentar removê-lo. Uma falha de rede pode
impedir a limpeza: nesses casos é preferível manter um ficheiro órfão a apagar uma
imagem ainda utilizada. Não se apagam ficheiros de outros utilizadores.

### Testar seguidores com duas contas próprias (A e B)

1. Executar o SQL, recarregar a aplicação e entrar como A. Abrir Membros (também está na
   navegação móvel). Confirmar nomes, bios e avatares reais e que o próprio cartão não
   tem botão Seguir. Usar Anterior/Seguinte se houver mais de 24 perfis.
2. No cartão de B, clicar Seguir. O botão passa a Deixar de seguir; o total A seguir de A
   e o total Seguidores de B aumentam uma unidade. Recarregar e confirmar persistência.
3. Abrir Perfil de A: as contagens devem coincidir com Membros. Em outra janela/perfil
   do navegador, entrar como B e clicar Atualizar seguidores no Perfil: o novo seguidor
   deve ser contado. Nesta fase as atualizações entre sessões são manuais.
4. Em Supabase Table Editor → follows, verificar uma única linha com follower_id=A e
   following_id=B. Clicar novamente em Deixar de seguir como A: a linha desaparece e
   ambas as contagens regressam aos valores anteriores. Seguir duas vezes não duplica.
5. Confirmar que B pode seguir A independentemente da relação A→B. Depois de sair da
   conta, Membros deve pedir autenticação e não mostrar dados da sessão anterior.

### Testar avatar

1. Perfil → Editar perfil → Carregar avatar. Escolher uma imagem de telemóvel JPEG/PNG/WebP
   inferior a 10 MiB. Aguardar a compressão, verificar orientação, proporções e tamanho
   apresentados. Guardar: deve aparecer no Perfil e na navegação.
2. Recarregar e voltar a entrar. Entrar como B e abrir Membros: o avatar de A deve aparecer.
3. Storage → avatars: verificar ficheiro <UUID de A>/<UUID>.jpg, MIME image/jpeg e tamanho
   até 262144 bytes. Na tabela profiles, avatar_url deve conter storage://avatars/…
4. Substituir o avatar: o novo deve aparecer e o anterior deve ser apagado se não estiver
   em uso. Remover avatar atual e guardar: devem aparecer as iniciais, sem perder nome/bio.

### Testar fotos de atividades

1. Registar atividade preenchendo os campos e escolhendo uma foto. Aguardar a compressão
   e guardar. Confirmar foto no Painel, no histórico e nas atividades do Perfil.
2. Recarregar. Em activities, photo_url deve conter storage://activity-photos/…; em Storage,
   o ficheiro correspondente deve ser JPEG até 1048576 bytes, com pasta do dono.
3. Numa atividade anterior sem foto, escolher Adicionar foto → selecionar → Guardar foto.
   Depois testar Alterar foto e Remover foto. Não devem mudar os quilómetros, duração,
   elevação, gráficos ou contagem de atividades. O ficheiro substituído deve ser limpo
   se não estiver referenciado noutro registo e a rede estiver disponível.
4. Registar outra atividade sem foto: deve continuar a funcionar normalmente.

### Limites, falhas e acesso

- Tentar selecionar ficheiro acima de 10 MiB, SVG/GIF ou conteúdo inválido: deve surgir
  erro e Guardar ficar indisponível até limpar ou corrigir a seleção.
- Selecionar uma imagem válida e, depois de comprimir, ativar Offline nas DevTools antes
  de Guardar: deve surgir erro sem sucesso, preservando os dados e a seleção. Repor Online
  e repetir. Testar também seguir/deixar de seguir em Offline e repetir com rede.
- Confirmar em Storage que ambos os buckets estão privados. Testar o endereço
  /storage/v1/object/public/avatars/<pasta>/<ficheiro> sem assinatura: não deve devolver a imagem.
  Um URL /object/sign/… com token ainda válido pode funcionar até expirar; isso é esperado.
- Com a sessão A, pedidos de upload/remoção para a pasta de B devem ser recusados pela RLS.
  Nas chamadas à Data API, A não pode criar/remover uma relação cujo follower_id seja B.
  Fazer estes testes com contas e ficheiros de teste através da API, não com o SQL Editor
  em modo administrador, pois o administrador pode ignorar a RLS.

### Validação automática

`node --test tests/activities.test.cjs tests/phase3.test.cjs`
`npx tsc --noEmit`

Os testes cobrem os cálculos da fase 2, limites, caminhos, fluxo de compressão (canvas
simulado), uploads, limpeza de ficheiros, seguir/deixar de seguir e contagens acima do
limite de linhas. A qualidade visual e a aplicação efetiva das RLS/GRANT na instância
Supabase devem ser confirmadas com os testes manuais acima.

## Fase 4 — chat persistente e Supabase Realtime

### SQL a executar

Executar apenas `supabase/migrations/004_chat_realtime.sql` no SQL Editor depois das
fases anteriores. O ficheiro começa com o comentário da fase 4, seguido de `begin;`,
e termina com `commit;`. Não contém texto do prompt. A cópia de entrega tem exatamente
o mesmo conteúdo da migração. É seguro repetir; não executar novamente schema.sql,
seed.sql ou fix-permissoes.sql para esta fase.

O SQL:

- Garante a existência de #geral, #vitórias, #momentos e #eventos sem alterar os IDs
  dos canais existentes nem criar mensagens fictícias.
- Inclui os GRANT explícitos para canais, mensagens, reações, perfis e atividades.
  anon não pode ler/escrever canais, mensagens ou reações. authenticated pode ler o
  chat comunitário, inserir mensagens e gerir apenas as suas próprias reações.
- Mantém RLS em channels, messages e reactions. Mensagens novas têm author_id igual
  a auth.uid() e pinned=false. DELETE continua limitado ao autor ou administrador;
  UPDATE está limitado à coluna pinned e à política de administrador. A interface de
  moderação fica para a fase 5.
- Adiciona messages.activity_card e um trigger que guarda no servidor o tipo,
  distância, duração e data da atividade no momento da partilha. Só permite partilhar
  atividades do autor. O cliente não recebe INSERT/UPDATE direto de activity_card,
  pinned, created_at ou dos campos de autoria/canal após a criação.
- Verifica texto até 4000 caracteres, conteúdo não vazio, foto na pasta do autor e
  resposta para uma mensagem do mesmo canal. Foto ou atividade sem texto são válidas.
- Cria chat_reaction_summary(uuid[]) com SECURITY INVOKER e GRANT EXECUTE apenas para
  authenticated, para contar todas as reações sem truncar pelo limite de linhas da API.
  A chave primária original impede reações iguais duplicadas pelo mesmo utilizador.
- Configura o bucket photos já existente como PRIVADO, JPEG, máximo 1048576 bytes.
  Define SELECT para uploads próprios ou fotos associadas a mensagens visíveis;
  INSERT/DELETE apenas na pasta própria. Sem UPDATE: nomes únicos e upsert:false.
  Inclui USAGE de storage, GRANT SELECT/INSERT/DELETE em storage.objects e EXECUTE
  de storage.foldername(text). Não altera avatars ou activity-photos.
- Adiciona messages, reactions e profiles à publication supabase_realtime apenas se
  ainda não estiverem lá. profiles permite atualizar nomes/avatares dos autores nas
  mensagens existentes. Usa REPLICA IDENTITY FULL em messages/reactions e recarrega
  o cache de esquema do PostgREST. Não cria sequences.

### Comportamento da interface

- Cada canal tem o seu histórico. Mostra as 50 mensagens mais recentes e permite
  Carregar mensagens anteriores, em blocos adicionais. O cliente pagina também as
  respostas da API para não assumir o limite padrão de linhas.
- O Realtime atualiza novas mensagens, reações e alterações aos autores. Nos DELETE,
  recarrega o canal sem depender dos campos antigos do payload. Ao voltar a ligar,
  ganhar foco ou recuperar a rede, volta a ler os dados para recuperar eventos perdidos.
- A ligação tem estado visível: A ligar, Em tempo real ou Ligação interrompida.
  Existem Atualizar, Voltar a ligar e mensagens de erro. Uma falha não é apresentada
  como um canal vazio. Não há mensagens, autores ou números de demonstração.
- Texto é apresentado como texto, incluindo emojis; não é interpretado como HTML.
  Há botões para inserir emojis e reações 🔥👏💪. Clicar numa reação própria remove-a.
- Responder mostra o autor e um excerto da mensagem original; a resposta fica guardada
  em reply_to. Os autores são carregados de profiles, com os avatares da fase 3.
- Partilhar atividade apresenta um cartão com tipo, km, tempo e ritmo médio. É uma
  fotografia dos valores no momento da partilha; mantém-se se a atividade for apagada.
  O histórico original das atividades e os gráficos não são alterados pelo chat.
- O rascunho e a resposta selecionada são limpos ao mudar de canal/conta. Um erro de
  envio mantém os campos para repetir. O UUID da tentativa é reutilizado para evitar
  duplicação quando o servidor gravou mas a resposta do pedido se perdeu.
- Fotos: JPEG/PNG/WebP originais até 10 MiB e 40 MP, comprimidas no navegador para JPEG
  com lado maior até 1920 px e tamanho até 1 MiB antes do upload. A pré-visualização
  mostra dimensões e tamanho finais. SVG/GIF/ficheiros inválidos são recusados.
- A base de dados guarda storage://photos/<UUID do autor>/<UUID>.jpg. A leitura usa
  URLs assinados por uma hora, renovados aos 45 minutos. Não se guarda o URL temporário.
  Um URL assinado copiado pode funcionar sem sessão até expirar; o URL público sem
  assinatura não dá acesso ao bucket privado.
- Uploads sem referência são limpos quando é seguro confirmar que não ficaram
  associados a uma mensagem. Se a rede impedir essa confirmação, são conservados
  para evitar apagar imagens ainda utilizadas.

### Teste manual com duas contas próprias A e B

Usar duas sessões independentes: por exemplo uma janela normal e outra anónima.
Duas janelas normais do mesmo perfil de navegador podem partilhar a sessão.

1. Executar o SQL. Recarregar ambas as janelas, entrar como A e B, abrir Chat e colocar
   lado a lado. Confirmar os quatro canais e esperar por Em tempo real nas duas.
   Num canal sem mensagens, confirmar o estado vazio; não devem aparecer Ana/Paulo
   de demonstração nem um contador fictício no menu.
2. Em #geral, A envia “Olá equipa! 🏃🔥”. Sem recarregar, B deve ver a mensagem com o
   nome/avatar reais de A. B responde com texto/emojis; A deve ver a mensagem em direto.
   Recarregar e confirmar persistência. Testar texto com várias linhas.
3. Mudar B para #vitórias e enviar uma mensagem. A, em #geral, não deve vê-la nesse
   canal. Ao mudar para #vitórias, deve encontrar a mensagem. Repetir nos outros canais.
4. B clica 🔥 numa mensagem de A: a contagem deve ser 1 em ambas as janelas e o botão
   de B deve ficar selecionado. A também clica: total 2. B clica novamente: total 1.
   Testar 👏 e 💪 e confirmar persistência depois de recarregar. Em reactions, verificar
   message_id/user_id/emoji e ausência de duplicados da mesma combinação.
5. B clica Responder na mensagem de A, escreve e envia. As duas janelas devem mostrar
   o excerto e autor original acima da resposta. Verificar reply_to em messages.
   Mudar de canal durante um rascunho: não deve ser enviado para o canal errado.
6. A escolhe uma foto válida em Foto da mensagem, espera pela compressão e envia.
   Testar foto com legenda e foto sem texto. B deve conseguir ver/abrir a imagem.
   Recarregar e confirmar persistência. No Storage → photos, verificar pasta UUID de A,
   MIME image/jpeg e tamanho até 1048576 bytes; photo_url deve conter storage://photos/…
7. A regista no Painel uma atividade Corrida de 5 km e 30 minutos. Volta ao Chat,
   seleciona-a em Partilhar uma atividade e envia (com ou sem texto). Se foi criada
   noutro separador, usar Atualizar atividades. Nas duas contas, o cartão deve mostrar
   Corrida, 5 km, 0h30min e 6:00/km. Verificar activity_id e activity_card em messages.
   B não deve ter a atividade de A na sua lista de atividades para partilhar.
8. Enquanto A mantém o Chat aberto, B muda o próprio nome/avatar no Perfil. Nas mensagens
   existentes de B vistas por A, o nome/avatar devem atualizar após o evento Realtime.
9. Se houver mais de 50 mensagens no canal, testar Carregar mensagens anteriores e
   responder a uma mensagem antiga. Não devem aparecer duplicados nem mensagens de
   outro canal. A referência a uma resposta fora da página também deve ser carregada.
10. Testar guardar uma foto acima de 10 MiB, SVG/GIF ou conteúdo inválido: deve mostrar
    erro e bloquear Enviar até limpar/corrigir a seleção. Mensagem vazia sem anexo não
    pode ser enviada. Testar o limite de 4000 caracteres.
11. Preparar uma mensagem e ativar Offline nas DevTools antes de Enviar: deve surgir
    erro, sem falsa confirmação de sucesso, preservando os campos. Repor Online,
    aguardar a reconexão/usar Voltar a ligar e repetir. Confirmar uma única mensagem
    gravada. Testar também uma reação em Offline.
12. Depois de sair da conta, Chat deve pedir login e não mostrar os dados anteriores.
    Confirmar que os avatares, fotos de atividades e seguidores da fase 3 continuam a
    funcionar e que o chat não altera os totais da fase 2.

### Verificar publication no SQL Editor

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('messages', 'reactions', 'profiles')
order by tablename;
```

Devem aparecer as três tabelas. Se a ligação não chegar a Em tempo real, verificar o
acesso WebSocket à instância, os logs do Realtime e se o SQL terminou sem erros. O
botão Atualizar permite distinguir uma falha de leitura de uma falha de subscrição.

### Verificações de permissões

Através de pedidos autenticados como A (não do SQL Editor em modo administrador):

- Não pode enviar mensagens com author_id de B ou pinned=true, alterar author_id,
  channel_id, created_at ou activity_card, nem fixar mensagens sem ser administrador.
- Não pode partilhar uma atividade de B nem responder a uma mensagem de outro canal.
- Não pode inserir/apagar uma reação de B ou usar emojis fora de 🔥👏💪.
- Não pode enviar/apagar fotos na pasta de B; pedidos anónimos não podem ler o chat
  nem obter novos URLs assinados. O endereço público sem assinatura do bucket photos
  não deve devolver uma imagem.

Para verificar eventos DELETE sem avançar para moderação, pode apagar no Table Editor
uma mensagem de teste: deve desaparecer das duas janelas e as suas reações devem
ser removidas pela FK. O Table Editor usa permissões administrativas e não valida RLS.
A gestão de moderação e limpeza após apagar mensagens fica para a fase 5.

### Validação automática

`node --test tests/activities.test.cjs tests/phase3.test.cjs tests/chat.test.cjs`
`npx tsc --noEmit`

Os testes usam clientes Supabase e canvas simulados: cobrem persistência/recuperação
no fluxo do cliente, paginação, reações, respostas, isolamento por canal, fila de eventos,
limites/imagens, regressões das fases anteriores e o início/fim válido do ficheiro SQL.
A gravação real, qualidade das imagens, Realtime e RLS na tua instância precisam dos
testes manuais acima; o SQL não foi executado remotamente pelo assistente.

## Comunidade fechada — acesso por sessao no servidor

Esta alteracao prepara o acesso antes da fase 5; nao implementa o painel de administracao.

### O que mudou

- `/` e uma pagina publica simples com logotipo Run 258, slogan, resumo curto, Instagram,
  Criar conta e Entrar. Nao importa os componentes nem consulta dados da comunidade.
- Rotas reais: `/inicio`, `/painel`, `/atividades`, `/chat`, `/perfil`, `/membros`,
  `/eventos` e `/admin`. Menu completo para membros, incluindo Eventos no telemovel.
- `middleware.ts` usa `@supabase/ssr` com cookies e `auth.getUser()` para validar a sessao
  no servidor. As paginas privadas repetem a validacao antes de renderizar, mesmo se o
  middleware nao fosse executado. Nao se usa `getSession()` como autorizacao.
- Sem sessao, o servidor redireciona para `/?next=<rota-pedida>`. Login/confirmacao/OAuth
  regressam a esse destino; sem destino, vao para `/inicio`. Apenas destinos internos
  da comunidade sao aceites. Links externos em `next` sao ignorados.
- A confirmacao de email continua a obedecer as definicoes do Supabase: se exigida,
  mostra a indicacao para confirmar antes de entrar, sem acesso privado antecipado.
- Logout no cabecalho ou Perfil volta a `/`, limpa a vista privada e a navegacao de
  autenticacao faz uma nova requisicao ao servidor. Respostas privadas usam no-store.
- `/admin` ja exige sessao, mas apresenta apenas um aviso de que o painel fica para a
  fase 5. Nao disponibiliza ferramentas ou dados administrativos.
- As fotos em Storage passam a ser descarregadas com a sessao do membro e mostradas
  por URLs blob locais ao navegador. A aplicacao deixa de criar novos URLs assinados.
- Eventos so sao consultados dentro da comunidade e sao lidos da tabela events.

### Dependencia e configuracao de Auth

Foi instalado `@supabase/ssr`. Nao ha novas variaveis de ambiente: continuam a ser usados
NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY. A chave publica pode continuar
no browser: e a sessao do utilizador que autoriza o acesso aos dados.

Reiniciar `npm run dev` depois da atualizacao. Pode ser necessario voltar a entrar,
porque a sessao anterior estava em localStorage e agora e partilhada por cookies.

No Supabase → Authentication → URL Configuration, definir Site URL para o endereco
real da aplicacao. Em Redirect URLs, permitir o callback com os seus parametros, por
exemplo, se a app estiver na porta 3000:

- `http://localhost:3000/auth/callback**`
- `http://localhost:3000/auth/confirm**`

Usar a porta/endereco efetivos (por exemplo 3001, se for esse o servidor em uso).
Em producao, adicionar os equivalentes com o dominio HTTPS. Nao e necessario ativar
Google para usar email/palavra-passe; se ja estiver configurado, continua disponivel.
O callback PKCE `/auth/callback` troca o codigo por uma sessao nos cookies e preserva next.

O template padrao de confirmacao de email com ConfirmationURL funciona com o fluxo
PKCE no mesmo navegador. Existe tambem `/auth/confirm` para templates com token_hash.
Se usares um template personalizado para funcionar noutro navegador, pode usar:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Confirmar email</a>
```

O callback aceita tanto o codigo PKCE como token_hash/type para estes templates.
Nao e preciso alterar o template padrao para testar login e confirmacao PKCE no mesmo
navegador. O endpoint /auth/confirm tambem esta disponivel para templates personalizados.

### SQL novo

Executar `supabase/migrations/005_closed_community.sql` no SQL Editor depois da fase 4.
A copia de entrega chama-se `comunidade-fechada.sql`. Comeca com `begin;`, termina com
`commit;` e nao tem texto do prompt. E seguro repetir. Nao executar SQL antigos depois
porque poderiam voltar a conceder acessos a anon.

O SQL revoga os privilegios de anon, incluindo por coluna, em profiles, activities,
follows, channels, messages, reactions, events e, se existirem, announcements/anuncios.
Remove apenas anon das listas de roles de politicas mistas; preserva as expressoes e
os roles restantes. Acrescenta uma politica RESTRICTIVE apenas para anon, com false,
para tambem bloquear acessos herdados de PUBLIC.

No Storage, revoga os privilegios anonimos em tabelas e colunas, retira USAGE do schema
para anon e aplica uma barreira RLS anonima a objects e buckets. Reafirma que avatars,
activity-photos e photos sao privados. Nao revoga GRANT nem altera as condicoes de RLS
de authenticated. Nao cria tabelas nem concede permissoes adicionais a membros.

Importante sobre links antigos: um URL assinado emitido antes desta alteracao continua
valido ate expirar (o codigo anterior usava uma hora). Revogar anon nao invalida esses
tokens. A aplicacao ja nao cria novos. Para invalidacao imediata, e necessario revogar
a chave de assinatura correspondente nas definicoes de Storage do Supabase; isto nao
foi efetuado automaticamente. Ficheiros ja descarregados por um membro tambem nao podem
ser retirados do navegador de quem os recebeu.

### Como testar

1. Executar o SQL e reiniciar o servidor de desenvolvimento. Abrir `/` numa janela
   anonima, sem login. Deve aparecer apenas a entrada simples, sem menus, contagens,
   atividades, autores, mensagens, eventos ou fotos de membros. Em Network, a pagina
   publica nao deve fazer pedidos a profiles/activities/messages/follows/events/Storage.
2. Ainda sem login, escrever diretamente `/painel`, `/chat`, `/perfil`, `/membros`,
   `/eventos` e `/admin`. Cada URL deve responder com redirecionamento para a entrada,
   com next a preservar o destino. Testar tambem `/inicio` e `/atividades`.
3. Criar uma conta em `/`. Se confirmacao de email estiver ativa, confirmar pelo link
   recebido; so depois deve entrar. Sem destino pedido, deve chegar a `/inicio`, com
   o menu Início, Painel, Chat, Perfil, Membros e Eventos. Testar tambem Entrar com conta
   existente. Com Google configurado, testar o callback OAuth.
4. Sair. Abrir `/chat?teste=retorno` sem login e entrar: deve voltar exatamente a esse
   destino, com o parametro preservado. Repetir para Perfil e Eventos. Uma URL como
   `/?next=https://example.com` deve enviar para `/inicio`, nunca para o site externo.
5. Recarregar uma rota privada enquanto autenticado: deve manter a sessao e a rota.
   Testar os menus, voltar/avancar do navegador e uma nova janela com a mesma sessao.
6. Terminar sessao pelo cabecalho ou Perfil: deve voltar imediatamente a entrada.
   Reabrir uma rota privada/recarregar/tentar Voltar: nao deve obter dados privados
   sem uma nova sessao valida. Testar tambem logout noutra aba da mesma sessao.
7. Com sessao, confirmar que Perfil, atividades/graficos, seguir/deixar de seguir, fotos,
   chat Realtime/reacoes/respostas e eventos continuam a funcionar. As fotos devem ser
   pedidas ao Storage com autenticacao e mostradas como blob:, sem novos pedidos a
   /object/sign/. Os avatares antigos externos HTTPS podem continuar como antes.
8. Fora da sessao, usar a API diretamente apenas com a chave publica: SELECT das tabelas
   privadas deve ser recusado ou devolver zero linhas, nunca dados. As RPC da comunidade
   tambem nao devem devolver dados. Storage list/download/upload sem sessao deve falhar;
   /object/public/... nao deve devolver imagens dos tres buckets privados.
9. `/admin` sem sessao deve redirecionar. Depois de entrar, mostra apenas o aviso de fase 5,
   sem qualquer acao administrativa. Esta alteracao nao cria uma funcao de administrador.

### Testar API anonima pela consola do navegador

Usar uma janela sem sessao. Substituir SUPABASE_URL e CHAVE_PUBLICA pelos valores do
projeto; nunca colocar service_role ou o access_token de uma conta neste teste.

```js
const supabaseUrl = 'SUPABASE_URL';
const publicKey = 'CHAVE_PUBLICA';
for (const table of ['profiles', 'activities', 'follows', 'channels', 'messages', 'reactions', 'events']) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}` }
  });
  console.log(table, response.status, await response.json());
}
```

Com uma chave anon JWT, os pedidos acima devem falhar por falta de permissao ou nao
retornar linhas. Se a chave for publishable (sb_publishable_...), omitir o header
Authorization e manter apenas apikey; chaves publishable nao sao JWT.
Executar no SQL Editor como postgres nao testa o role anon, pois e um administrador.

### Validacao automatica

`node --test tests/activities.test.cjs tests/phase3.test.cjs tests/chat.test.cjs tests/access.test.cjs`
`npm run typecheck` (regenera os tipos das rotas e verifica TypeScript)

Os testes usam Auth simulado para verificar middleware, cookies renovados, destinos de
retorno, callbacks, segunda verificacao nas paginas e renderizacao publica sem menu.
Os testes das fases anteriores continuam incluidos. Login real, confirmacao de email,
Google e permissoes da instancia Supabase devem ser confirmados manualmente acima.

## Fase 5 — administracao e moderacao

### Instalar

1. No SQL Editor, executar `supabase/migrations/006_admin_moderation.sql` depois de
   `005_closed_community.sql`. A copia de entrega e `fase-5-admin-moderacao.sql`.
   Comeca com `begin;`, termina com `commit;`, nao tem texto do prompt e e seguro repetir.
2. Executar no SQL Editor o ficheiro separado `tornar-admin.sql`, entregue em outputs,
   que usa o email indicado pelo titular. Deve devolver exatamente uma linha com
   role=admin e status=active. Se nao devolver linhas, confirmar que essa conta existe
   em Authentication e tem perfil (fases anteriores).
3. Recarregar a aplicacao e abrir `/admin`. Nao ha novas variaveis de ambiente nem
   necessidade de service_role no browser ou servidor para estas operacoes.

### Papeis e protecao

`profiles.role` e a fonte de verdade, com valores member e admin. `profiles.status`
aceita active, suspended ou removed. A antiga coluna is_admin e mantida sincronizada
por compatibilidade; ja nao determina privilegios por si propria.

A migracao preserva admins antigos, se existirem, a partir de is_admin apenas quando
cria a coluna role. Alteracoes posteriores de papel sao feitas no SQL Editor; nao ha
nenhum formulario ou RPC de promocao de roles. A criacao de conta continua a gerar
role=member e nao confia em user_metadata/app_metadata para conceder privilegios.

- GRANT de UPDATE em profiles apenas para name, bio e avatar_url. Sem INSERT/DELETE de
  perfis pelo cliente. Um trigger recusa alteracoes de role, status, is_admin, id ou
  moderation_reason por authenticated/anon, mesmo se alguem alargar um GRANT depois.
- RLS mantem a edicao de perfil limitada ao proprio utilizador e acrescenta a exigencia
  de conta ativa em todas as tabelas da comunidade e no Storage.
- `community_access()` devolve apenas o papel/estado da propria conta; `is_admin()` e
  `is_active_member()` consultam a base de dados. Sao SECURITY DEFINER com search_path
  fixo e EXECUTE apenas para authenticated, sem parametros de identidade falsificaveis.
- O middleware valida a sessao e o estado na base de dados. Membro normal recebe 403
  em `/admin`; paginas privadas repetem a verificacao no servidor e nao renderizam
  ferramentas de admin para membros normais. O menu Admin aparece apenas para admins.
- A interface volta a consultar o acesso por Realtime, ao ganhar foco, recuperar a rede
  e a cada 15 segundos. A API/RLS ja bloqueia imediatamente novas operacoes de um membro
  suspenso/removido, mesmo com JWT ainda valido. A vista aberta pode demorar ate 15 segundos
  a desaparecer; dados ja descarregados nao podem ser retirados de um navegador.

### Funcionalidades

**Eventos** — criar, editar e apagar nome, data, local de concentracao, hora de
concentracao, hora de partida e descricao. O formulario valida os valores e a base de
dados valida conteudo novo/alterado. No Inicio dos membros aparecem os proximos tres
(eventos futuros, ordenados por data); a pagina Eventos mostra o historico completo.

**Anuncios** — criar, editar, apagar e fixar/desafixar. Anuncios fixados aparecem primeiro
no Inicio. Os restantes continuam na lista normal. Texto tratado como texto, sem HTML.
A tabela announcements tem RLS, GRANT por coluna e autoria do administrador autenticado.

**Chat** — fixar/desafixar e apagar mensagens de outros membros, no proprio Chat ou
no separador Mensagens do painel. Cada canal tem uma zona de mensagens fixadas que
inclui mensagens antigas fora das ultimas 50. Apagar exige confirmacao, apaga reacoes
por FK e tenta limpar a foto via Storage API apenas se nao houver mais referencias.
Se a limpeza falhar, a mensagem continua apagada e pode ficar um ficheiro orfao privado.
As politicas de Storage permitem essa limpeza a admins ativos, sem abrir os buckets.

**Membros** — lista paginada com pesquisa por nome/email, papel, estado e motivo.
A RPC administrativa consulta emails em auth.users apenas depois de verificar is_admin.
Um membro normal nao tem acesso a essa RPC. Nao e preciso conceder acesso direto a auth.users.

- Suspender bloqueia o acesso ate reativacao e preserva os follows para poderem reaparecer.
- Remover da comunidade bloqueia o acesso, retira o membro do diretorio normal e apaga
  as relacoes de seguidores em ambos os sentidos. Nao apaga a conta Supabase Auth nem
  atividades/mensagens historicas. Nao e uma eliminacao definitiva de dados pessoais.
- Reativar devolve o acesso; follows apagados na remocao nao sao recriados.
- O proprio administrador e outros administradores nao podem ser suspensos/removidos
  por estas ferramentas. A gestao de papeis administrativos continua no SQL Editor.

Eventos e anuncios continuam **apenas para membros**, conforme confirmado. A entrada
publica nao faz pedidos a estes dados. As funcoes e tabelas novas nao concedem acesso
anonimo; as barreiras contra anon da comunidade fechada sao mantidas.

### SQL incluido

Alem de role/status e dos triggers de protecao, o ficheiro inclui:

- GRANT explicitos nas colunas/tabelas e EXECUTE das funcoes necessarias; todos os
  novos objetos fechados a PUBLIC/anon, de acordo com a funcao de cada um.
- RLS de anuncios e eventos: membros ativos leem; so admins ativos escrevem/apagam.
- RLS de moderacao de mensagens, leitura/limpeza de Storage por admin e barreiras de
  conta ativa tambem em profiles, activities, follows, channels, messages e reactions.
- RPCs admin_list_members e admin_moderate_member, SECURITY DEFINER com verificacao
  do administrador na primeira instrucao; ator obtido por auth.uid(), nunca enviado
  pelo cliente. A moderacao bloqueia a propria conta e outros administradores.
- Diretorio/follows limitados a perfis ativos. Uma conta suspensa nao pode receber
  novos follows atraves de chamadas diretas a API.
- Publication supabase_realtime para profiles, messages, reactions, events e announcements,
  sem duplicar entradas existentes. Nao cria sequences; IDs continuam UUID.

### Como testar com duas contas A (admin) e B (membro)

1. Executar a migracao e o SQL de promocao. Recarregar A: deve aparecer Admin no menu.
   Abrir `/admin`. Em B, Admin nao deve aparecer; escrever `/admin` diretamente deve
   devolver acesso recusado. Sem sessao, deve ir para a entrada.
2. Como B, tentar pela API atualizar profiles.role para admin ou is_admin para true,
   tanto no proprio ID como no de A: deve falhar/nao alterar nenhuma linha. Alterar
   user_metadata.role tambem nao deve conceder Admin. Nome/bio/avatar proprios continuam
   editaveis. Nao testar estas tentativas como postgres no SQL Editor: esse e um operador
   de confianca, que tem de poder executar o comando de promocao.
3. Em Admin → Eventos, criar um evento com data futura, nome e local de concentracao,
   horas validas. Abrir Inicio/Eventos de B: deve aparecer. Editar nome/hora/local e
   confirmar atualizacao, inclusive noutra janela. Apagar, confirmar e verificar que
   desaparece. Uma tentativa de INSERT/UPDATE/DELETE de eventos como B deve ser recusada.
4. Em Admin → Anuncios, criar um anuncio e marcar Fixar no Inicio. Em B, deve aparecer
   no topo com indicacao de fixado. Criar outro nao fixado, testar fixar/desafixar, editar
   e apagar. B nao deve conseguir escrever/apagar/pinar anuncios via API.
5. B envia uma mensagem de texto e uma com foto no Chat. A usa Fixar numa dessas mensagens:
   deve aparecer na zona 📌 Mensagens fixadas do canal nas duas contas. Desafixar deve
   remove-la dessa zona. Testar uma mensagem antiga, se houver mais de 50 no canal.
6. Como A, apagar a mensagem de B e confirmar. Deve desaparecer nas duas contas e as
   reacoes devem ser apagadas. Se a foto nao estiver em uso noutro registo e a rede
   permitir, o ficheiro correspondente deve desaparecer de photos. Como B, uma chamada
   direta para fixar mensagens ou apagar uma mensagem de A nao deve alterar a linha.
7. Admin → Membros: pesquisar B pelo nome/email e suspender, indicando um motivo de teste.
   No separador de B ja aberto, tentar Atualizar Chat/atividades ou enviar mensagem:
   novos acessos devem ser recusados/nao devolver dados. Ao navegar/recarregar, deve ir
   para a entrada com a indicacao de suspensao. Mesmo voltando a fazer login, nao entra
   ate A reativar. Testar tambem chamadas diretas com o token antigo e um download de Storage.
8. Como A, reativar B. B volta a entrar e usa Perfil, atividades, seguidores, fotos e Chat
   normalmente. Admins devem continuar bloqueados nos controlos de suspender/remover,
   incluindo na RPC (nao apenas nos botoes).
9. Com uma conta de teste, estabelecer follows e depois Remover da comunidade. Confirmar
   perda de acesso, ausencia no diretorio normal e follows removidos. Auth e historico
   devem continuar na base. Se a reativares, o acesso volta mas os follows nao reaparecem.
10. Confirmar que visitas sem sessao continuam a ver so a entrada, sem eventos/anuncios.
    Testar modo Offline durante uma gravacao/moderacao: deve mostrar erro sem sucesso
    ficticio, permitir tentar novamente e nao conceder acesso administrativo por falha.

### Validacao automatica

Suite normal:

`node --test tests/activities.test.cjs tests/phase3.test.cjs tests/chat.test.cjs tests/access.test.cjs tests/admin.test.cjs`

Tipos:

`npm run typecheck`

Existe ainda `tests/admin-rls.cjs`, teste opcional com PostgreSQL em memoria (PGlite).
O pacote de teste foi instalado apenas na pasta work, sem mudar dependencias de producao.
Para reproduzir com PGlite instalado numa pasta de ferramentas:

```powershell
$env:PGLITE_MODULE = (Resolve-Path '../work/sql-check/node_modules/@electric-sql/pglite').Path
node tests/admin-rls.cjs
```

Esse teste executa o esquema e migracoes numa base temporaria, incluindo tentativas
reais de UPDATE do papel, uma concessao acidental de UPDATE, moderacao sem admin,
suspensao com a mesma identidade, Storage, limpeza, remocao, acesso anonimo e repeticao
da migracao. Nao liga a instancia Supabase nem envia emails.
A validacao final de Auth, Storage fisico e Realtime na instancia real continua a ser
feita com os passos manuais acima. Nenhum SQL foi executado remotamente pelo assistente.
