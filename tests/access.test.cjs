const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{NextRequest}=require('next/server');
function load(path,modules={},env={NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-key'}){
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module,exports:module.exports,URL,Request,Response,Headers,process:{env},require:name=>modules[name]||(name==='@/lib/community-access'?access:require(name))});return module.exports;
}
const navigation=load('lib/auth-navigation.ts');
const access=load('lib/community-access.ts');
function middlewareMock(getUser,env,permission={role:'member',status:'active'}){let captured;const module=load('middleware.ts',{'@/lib/auth-navigation':navigation,'@supabase/ssr':{createServerClient(url,key,options){captured=options;return {auth:{getUser:()=>getUser(options)},rpc:async()=>({data:permission,error:null})}}}},env);return {...module,options:()=>captured};}
const user={id:'member-uuid',email:'member@example.test'};
const denied=()=>({data:{user:null},error:{message:'invalid cookie'}});
const authorized=()=>({data:{user},error:null});
test('all private routes, activity history and nested admin paths are recognized',()=>{
 for(const path of ['/inicio','/painel','/atividades','/chat','/perfil','/membros','/eventos','/admin','/admin/settings'])assert.equal(navigation.isCommunityPath(path),true);
 for(const path of ['/','/auth/callback','/auth/confirm','/administer','/public.svg'])assert.equal(navigation.isCommunityPath(path),false);
});
test('login return targets are local protected routes, not external redirects',()=>{
 assert.equal(navigation.safeNext('/chat?canal=geral'),'/chat?canal=geral');assert.equal(navigation.safeNext('/perfil#foto'),'/perfil#foto');
 for(const value of [null,'','https://evil.test','//evil.test','/\\evil.test','/chat%5cevil','/chat%0a','/chat/%ZZ','/auth/callback','/?next=/chat','javascript:alert(1)'])assert.equal(navigation.safeNext(value),'/inicio');
});
test('forged cookie cannot grant access: middleware requires server getUser validation',async()=>{
 let calls=0;const guard=middlewareMock(()=>{calls++;return denied()});const response=await guard.middleware(new NextRequest('https://run258.test/chat?canal=geral',{headers:{cookie:'sb-forged=not-a-session'}}));
 assert.equal(calls,1);assert.equal(response.status,307);const destination=new URL(response.headers.get('location'));assert.equal(destination.pathname,'/');assert.equal(destination.searchParams.get('next'),'/chat?canal=geral');assert.match(response.headers.get('cache-control'),/no-store/);
});
test('each required private URL redirects a visitor at the server',async()=>{
 const guard=middlewareMock(denied);for(const path of ['/painel','/chat','/perfil','/membros','/eventos','/admin']){const response=await guard.middleware(new NextRequest('https://run258.test'+path));assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location')).searchParams.get('next'),path);}
});
test('renewed cookies are preserved in both forwarded requests and login redirects',async()=>{
 const guard=middlewareMock(options=>{options.cookies.setAll([{name:'sb-test',value:'renewed',options:{path:'/',sameSite:'lax'}}]);return denied()});const request=new NextRequest('https://run258.test/perfil');const response=await guard.middleware(request);
 assert.equal(request.cookies.get('sb-test').value,'renewed');assert.equal(response.cookies.get('sb-test').value,'renewed');
});
test('authenticated middleware passes private requests and makes them non-cacheable',async()=>{
 const guard=middlewareMock(authorized);
 for(const path of ['/painel','/chat'])for(const headers of [{},{rsc:'1','next-router-prefetch':'1'}]){
  const response=await guard.middleware(new NextRequest('https://run258.test'+path,{headers}));
  assert.equal(response.status,200,path);assert.equal(response.headers.get('location'),null,path);assert.match(response.headers.get('cache-control'),/private, no-store/);
 }
});
test('network failures and missing config fail closed, while entry remains available',async()=>{
 const broken=middlewareMock(()=>{throw Error('network')});assert.equal((await broken.middleware(new NextRequest('https://run258.test/admin'))).status,307);
 const missing=middlewareMock(()=>{throw Error('should not call auth')},{});assert.equal((await missing.middleware(new NextRequest('https://run258.test/chat'))).status,307);assert.equal((await missing.middleware(new NextRequest('https://run258.test/'))).status,200);
});
function redirect(destination){throw Object.assign(Error('redirect'),{destination})}
const logo=load('app/logo.tsx');
const entry=load('app/entry.tsx',{'@/lib/supabase':{supabase:null},'@/lib/auth-navigation':navigation,'@/app/logo':logo});
test('public entry renders no community menu, members, activities, messages or events',()=>{
 const html=renderToStaticMarkup(React.createElement(entry.Entry,{destination:'/inicio'}));assert.ok(html.includes('Criar conta'));assert.ok(html.includes('Entrar'));assert.ok(html.includes('@run258_club'));assert.ok(html.includes('KM CONTA.'));
 for(const privateElement of ['sidebar','bottom-nav','nav-item','chat-layout','activity-list','profile-banner','event-detail'])assert.ok(!html.includes(privateElement),privateElement);
});
test('public root sends validated users to Inicio or the requested route',async()=>{
 const page=load('app/page.tsx',{'next/navigation':{redirect},'@/lib/supabase/server':{createServerSupabase:async()=>({auth:{getUser:authorized},rpc:async()=>({data:{role:'member',status:'active'},error:null})})},'@/lib/auth-navigation':navigation,'@/app/entry':entry});
 await assert.rejects(page.default({searchParams:Promise.resolve({})}),e=>e.destination==='/inicio');await assert.rejects(page.default({searchParams:Promise.resolve({next:'/chat'})}),e=>e.destination==='/chat');
});
test('private pages repeat authorization independently of middleware',async()=>{
 const protectedPage=load('app/community-page.tsx',{'next/navigation':{redirect},'@/lib/supabase/server':{createServerSupabase:async()=>({auth:{getUser:denied}})},'@/lib/auth-navigation':navigation,'@/app/community-app':{CommunityApp:()=>null}});
 await assert.rejects(protectedPage.renderCommunityPage('Chat'),e=>e.destination==='/?next=%2Fchat');
});
test('PKCE callback exchanges code and preserves only safe return targets',async()=>{
 let received;const callback=load('app/auth/callback/route.ts',{'@/lib/supabase/server':{createServerSupabase:async()=>({auth:{exchangeCodeForSession:async code=>{received=code;return {error:null}}}})},'@/lib/auth-navigation':navigation});
 const response=await callback.GET(new NextRequest('https://run258.test/auth/callback?code=test-code&next=%2Fchat'));assert.equal(received,'test-code');assert.equal(response.headers.get('location'),'https://run258.test/chat');
 const safe=await callback.GET(new NextRequest('https://run258.test/auth/callback?code=test-code&next=https://evil.test'));assert.equal(safe.headers.get('location'),'https://run258.test/inicio');
});
test('failed callbacks show entry with error instead of entering community',async()=>{
 const callback=load('app/auth/callback/route.ts',{'@/lib/supabase/server':{createServerSupabase:async()=>({auth:{exchangeCodeForSession:async()=>({error:{message:'expired'}})}})},'@/lib/auth-navigation':navigation});
 const response=await callback.GET(new NextRequest('https://run258.test/auth/callback?code=expired&next=%2Fperfil'));const destination=new URL(response.headers.get('location'));assert.equal(destination.pathname,'/');assert.equal(destination.searchParams.get('error'),'auth');assert.equal(destination.searchParams.get('next'),'/perfil');
});
test('privacy SQL starts with begin, ends with commit and does not revoke authenticated',()=>{
 const sql=fs.readFileSync('supabase/migrations/005_closed_community.sql','utf8'),lines=sql.trim().split(/\r?\n/);assert.equal(lines[0],'begin;');assert.equal(lines.at(-1),'commit;');assert.ok(!/revoke[^;]*from\s+authenticated/i.test(sql));assert.ok(sql.includes('as restrictive for all to anon using (false) with check (false)'));assert.ok(sql.includes("'profiles','activities','follows','channels','messages','reactions','events'"));
});

test('email token confirmation supports custom templates without changing the return target',async()=>{
 let received;const callback=load('app/auth/callback/route.ts',{'@/lib/supabase/server':{createServerSupabase:async()=>({auth:{verifyOtp:async payload=>{received=payload;return {error:null}}}})},'@/lib/auth-navigation':navigation});
 const response=await callback.GET(new NextRequest('https://run258.test/auth/callback?token_hash=test-hash&type=email&next=%2Fperfil'));assert.equal(received.type,'email');assert.equal(received.token_hash,'test-hash');assert.equal(response.headers.get('location'),'https://run258.test/perfil');
});

test('admin URL requires the current database role, even with a valid login',async()=>{
 const member=middlewareMock(authorized);assert.equal((await member.middleware(new NextRequest('https://run258.test/admin'))).status,403);
 const admin=middlewareMock(authorized,undefined,{role:'admin',status:'active'});assert.equal((await admin.middleware(new NextRequest('https://run258.test/admin'))).status,200);
});
test('suspended and removed accounts cannot enter private routes with a still-valid session',async()=>{
 for(const status of ['suspended','removed']){const guard=middlewareMock(authorized,undefined,{role:'member',status});const response=await guard.middleware(new NextRequest('https://run258.test/chat'));assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location')).searchParams.get('error'),status);}
});
test('server page refuses a non-admin independently of middleware',async()=>{
 const page=load('app/community-page.tsx',{'next/navigation':{redirect,notFound(){throw Object.assign(Error('not found'),{status:404})}},'@/lib/supabase/server':{createServerSupabase:async()=>({auth:{getUser:authorized},rpc:async()=>({data:{role:'member',status:'active'},error:null})})},'@/lib/auth-navigation':navigation,'@/app/community-app':{CommunityApp:()=>null}});
 await assert.rejects(page.renderCommunityPage('Admin'),e=>e.status===404);
});
