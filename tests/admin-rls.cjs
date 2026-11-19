// Teste opcional em PostgreSQL em memoria; nao liga ao Supabase real.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const ids={admin:'11111111-1111-4111-8111-111111111111',member:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333',admin2:'44444444-4444-4444-8444-444444444444'};
(async()=>{
 const db=new PGlite();let passed=0;
 async function check(name,fn){await fn();passed++;console.log('OK '+name)}
 async function asUser(id,fn,role='authenticated'){
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${id||''}',false);`);
  try{return await fn()}finally{await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);")}
 }
 const q=(sql,args=[])=>db.query(sql,args);
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema storage;create publication supabase_realtime;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,storage,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,owner_id text,unique(bucket_id,name));
    alter table storage.objects enable row level security;alter table storage.buckets enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  await db.exec(fs.readFileSync('supabase/fix-permissoes.sql','utf8'));
  for(const migration of ['002_activities.sql','003_follows_storage.sql','004_chat_realtime.sql','005_closed_community.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  for(const [name,id] of Object.entries(ids))await q('insert into auth.users(id,email) values($1,$2)',[id,name+'@example.test']);
  await q('update public.profiles set is_admin=true where id=$1',[ids.admin]);
  await db.exec(fs.readFileSync('supabase/migrations/006_admin_moderation.sql','utf8'));
  await q("update public.profiles set role='admin' where id=$1",[ids.admin2]);
  const channel=(await q("select id from public.channels where name='geral'")).rows[0].id;
  const message=(await q("insert into public.messages(channel_id,author_id,body) values($1,$2,'Mensagem para moderar') returning id",[channel,ids.other])).rows[0].id;
  const event=(await q("insert into public.events(name,event_date,location,meeting_time,start_time) values('Teste','2026-11-20','Marginal','05:15','05:30') returning id")).rows[0].id;
  await check('papel legado migra para role e mantem estado ativo',async()=>{const row=(await q('select role,status,is_admin from public.profiles where id=$1',[ids.admin])).rows[0];assert.equal(row.role,'admin');assert.equal(row.status,'active');assert.equal(row.is_admin,true)});
  await check('membro nao pode alterar papel proprio ou is_admin',async()=>{await asUser(ids.member,async()=>{for(const column of ["role='admin'","is_admin=true","status='active'"])await assert.rejects(q('update public.profiles set '+column+' where id=$1',[ids.member]),e=>e.code==='42501')})});
  await check('trigger trava escalada mesmo se um GRANT UPDATE for alargado por engano',async()=>{
    await db.exec('grant update on public.profiles to authenticated');
    await asUser(ids.member,async()=>{await assert.rejects(q("update public.profiles set role='admin' where id=$1",[ids.member]),e=>e.code==='42501');const result=await q("update public.profiles set role='member' where id=$1 returning id",[ids.admin]);assert.equal(result.rows.length,0)});
    await db.exec('revoke update on public.profiles from authenticated;grant update(name,bio,avatar_url) on public.profiles to authenticated');
  });
  await check('metadados Auth nao concedem admin',async()=>{await q(`update auth.users set raw_user_meta_data='{"role":"admin"}' where id=$1`,[ids.member]);await asUser(ids.member,async()=>assert.equal((await q('select public.is_admin() as value')).rows[0].value,false))});
  await check('membro nao cria eventos nem anuncios nem usa a RPC administrativa',async()=>{await asUser(ids.member,async()=>{
    await assert.rejects(q("insert into public.events(name,event_date,location,meeting_time,start_time) values('Intruso','2026-11-20','X','05:15','05:30')"),e=>e.code==='42501');
    await assert.rejects(q("insert into public.announcements(title,body,author_id) values('Intruso','Texto',$1)",[ids.member]),e=>e.code==='42501');
    await assert.rejects(q('select public.admin_list_members()'),e=>e.code==='42501');
    await assert.rejects(q("select public.admin_moderate_member($1,'suspended','')",[ids.other]),e=>e.code==='42501');
  })});
  await check('membro nao fixa nem apaga mensagens alheias; admin consegue',async()=>{
    await asUser(ids.member,async()=>{assert.equal((await q('update public.messages set pinned=true where id=$1 returning id',[message])).rows.length,0);assert.equal((await q('delete from public.messages where id=$1 returning id',[message])).rows.length,0)});
    await asUser(ids.admin,async()=>{assert.equal((await q('update public.messages set pinned=true where id=$1 returning pinned',[message])).rows[0].pinned,true)});
  });
  await check('admin cria edita fixa e apaga anuncios/eventos',async()=>{await asUser(ids.admin,async()=>{
    const id=(await q("insert into public.announcements(title,body,author_id) values('Aviso','Texto',$1) returning id",[ids.admin])).rows[0].id;
    assert.equal((await q('update public.announcements set pinned=true where id=$1 returning pinned',[id])).rows[0].pinned,true);
    await q('delete from public.announcements where id=$1',[id]);assert.equal((await q("update public.events set name='Evento editado' where id=$1 returning name",[event])).rows[0].name,'Evento editado');
  })});

  await check('admin apaga mensagem alheia e ficheiro; membro nao pode apagar ficheiros de outro',async()=>{
    const path=ids.other+'/66666666-6666-4666-8666-666666666666.jpg';
    await q("insert into storage.objects(bucket_id,name) values('photos',$1)",[path]);
    await q('insert into public.reactions(message_id,user_id,emoji) values($1,$2,$3)',[message,ids.member,'🔥']);
    await asUser(ids.member,async()=>assert.equal((await q("delete from storage.objects where bucket_id='photos' and name=$1 returning id",[path])).rows.length,0));
    await asUser(ids.admin,async()=>{assert.equal((await q('delete from public.messages where id=$1 returning id',[message])).rows.length,1);assert.equal((await q("delete from storage.objects where bucket_id='photos' and name=$1 returning id",[path])).rows.length,1)});
    assert.equal((await q('select * from public.reactions where message_id=$1',[message])).rows.length,0);
  });
  await check('administradores e a propria conta estao protegidos da moderacao',async()=>{await asUser(ids.admin,async()=>{
    await assert.rejects(q("select public.admin_moderate_member($1,'suspended','')",[ids.admin]),e=>e.code==='42501');await assert.rejects(q("select public.admin_moderate_member($1,'removed','')",[ids.admin2]),e=>e.code==='42501');
  })});
  await check('suspensao bloqueia API e Storage sem renovar o token',async()=>{
    await q("insert into storage.objects(bucket_id,name) values('avatars',$1)",[ids.member+'/55555555-5555-4555-8555-555555555555.jpg']);
    await asUser(ids.admin,()=>q("select public.admin_moderate_member($1,'suspended','teste')",[ids.member]));
    await asUser(ids.member,async()=>{
      for(const table of ['profiles','activities','follows','channels','messages','reactions','events','announcements'])assert.equal((await q('select * from public.'+table)).rows.length,0,table);
      assert.equal((await q('select * from storage.objects')).rows.length,0);
      assert.equal((await q('select public.community_access() as access')).rows[0].access.status,'suspended');
      await assert.rejects(q("insert into public.messages(channel_id,author_id,body) values($1,$2,'Bloqueado')",[channel,ids.member]),e=>e.code==='42501');
    });
    await asUser(ids.other,async()=>{await assert.rejects(q('insert into public.follows(follower_id,following_id) values($1,$2)',[ids.other,ids.member]),e=>e.code==='42501')});
    await asUser(ids.admin,()=>q("select public.admin_moderate_member($1,'active','')",[ids.member]));
    await asUser(ids.member,async()=>assert.ok((await q('select * from public.channels')).rows.length>0));
  });
  await check('remocao bloqueia acesso e elimina follows sem apagar Auth/historico',async()=>{
    await q('insert into public.follows(follower_id,following_id) values($1,$2)',[ids.member,ids.other]);
    await asUser(ids.admin,()=>q("select public.admin_moderate_member($1,'removed','teste')",[ids.member]));
    assert.equal((await q('select * from public.follows where follower_id=$1 or following_id=$1',[ids.member])).rows.length,0);
    assert.equal((await q('select id from auth.users where id=$1',[ids.member])).rows.length,1);
    await asUser(ids.other,async()=>{assert.equal((await q('select * from public.profiles where id=$1',[ids.member])).rows.length,0)});
    await asUser(ids.admin,async()=>{const result=(await q('select public.admin_list_members() as result')).rows[0].result;assert.ok(result.items.some(row=>row.id===ids.member&&row.status==='removed'))});
  });
  await check('anon continua sem acesso aos dados privados',async()=>{await asUser('',async()=>{await assert.rejects(q('select * from public.announcements'),e=>e.code==='42501');await assert.rejects(q('select public.admin_list_members()'),e=>e.code==='42501')},'anon')});
  await check('reexecutar a migracao preserva papeis e protecoes',async()=>{await db.exec(fs.readFileSync('supabase/migrations/006_admin_moderation.sql','utf8'));assert.equal((await q('select role from public.profiles where id=$1',[ids.admin])).rows[0].role,'admin');await asUser(ids.member,async()=>{await assert.rejects(q("update public.profiles set role='admin' where id=$1",[ids.member]),e=>e.code==='42501')})});
  console.log(`${passed} verificacoes SQL/RLS passaram em PostgreSQL local.`);
 }finally{await db.close()}
})().catch(error=>{console.error(error.message,error.code||'');process.exitCode=1});
