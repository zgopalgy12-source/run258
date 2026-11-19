const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,modules={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,Date,Math,Number,Error,FormData,Promise,require:name=>modules[name]||require(name)});return module.exports;}
const access=load('lib/community-access.ts');
const admin=load('lib/admin.ts',{'./community-access':access,'./image-policy':{parseImageRef:()=>null},'./images':{removeUnusedImage:async()=>true}});
function clientFor(role='member',status='active'){return {rpc:async()=>({data:{role,status},error:null})};}
test('admin authorization uses current database access, and suspended admins are denied',async()=>{
 await assert.rejects(admin.requireAdmin(clientFor('member')));await assert.rejects(admin.requireAdmin(clientFor('admin','suspended')));await admin.requireAdmin(clientFor('admin'));
});
test('member cannot submit event or message moderation requests through the client helpers',async()=>{
 const client=clientFor();let touched=false;client.from=()=>{touched=true;throw Error('unexpected')};await assert.rejects(admin.setMessagePinned(client,'message',true));await assert.rejects(admin.deleteEvent(client,'event'));assert.equal(touched,false);
});
test('message pin updates only pinned and confirms a row was actually changed',async()=>{

 const calls=[],client=clientFor('admin');
 const chain={update(value){calls.push(value);return this},eq(column,id){assert.equal(column,'id');assert.equal(id,'target');return this},select(){return this},async single(){return {data:{id:'target'},error:null}}};
 client.from=table=>{assert.equal(table,'messages');return chain};
 await admin.setMessagePinned(client,'target',true);assert.equal(JSON.stringify(calls),JSON.stringify([{pinned:true}]));

});
test('event form accepts required fields, rejects invalid dates, whitespace and times',()=>{
 const valid=new FormData();for(const [key,value] of Object.entries({name:'Treino Run 258',event_date:'2026-11-20',location:'Marginal',meeting_time:'05:15',start_time:'05:30'}))valid.set(key,value);
 assert.equal(admin.eventPayload(valid).location,'Marginal');valid.set('event_date','2026-02-30');assert.throws(()=>admin.eventPayload(valid));valid.set('event_date','2026-11-20');valid.set('start_time','25:30');assert.throws(()=>admin.eventPayload(valid));
});
test('announcement form trims values and keeps pin state explicit',()=>{
 const form=new FormData();form.set('title','  Aviso  ');form.set('body','  Encontro amanhã  ');form.set('pinned','on');const result=admin.announcementPayload(form);assert.equal(result.title,'Aviso');assert.equal(result.pinned,true);form.set('body',' ');assert.throws(()=>admin.announcementPayload(form));
});
test('member moderation refuses self or administrator targets before mutation',async()=>{
 let called=false;const client=clientFor('admin');client.rpc=async()=>{called=true;return {data:{role:'admin',status:'active'},error:null}};
 await assert.rejects(admin.moderateMember(client,{id:'self',role:'member'},'suspended','','self'));await assert.rejects(admin.moderateMember(client,{id:'other',role:'admin'},'removed','','self'));assert.equal(called,false);
});
test('moderation RPC never accepts actor ID or role changes',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push([name,args]);return name==='community_access'?{data:{role:'admin',status:'active'},error:null}:{data:null,error:null}}};await admin.moderateMember(client,{id:'target',role:'member'},'suspended','  motivo  ','self');assert.equal(calls[1][0],'admin_moderate_member');assert.equal(JSON.stringify(calls[1][1]),JSON.stringify({p_target:'target',p_status:'suspended',p_reason:'motivo'}));
});
test('admin SQL starts with valid SQL and has no prompt text',()=>{
 const sql=fs.readFileSync('supabase/migrations/006_admin_moderation.sql','utf8');assert.ok(sql.startsWith('begin;'));assert.ok(sql.trimEnd().endsWith('commit;'));assert.ok(!sql.includes('Avança para a fase'));
});
