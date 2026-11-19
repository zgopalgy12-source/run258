const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,extra={},modules={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,Date,Map,Set,Math,Number,Error,Promise,Blob,crypto:require('node:crypto').webcrypto,require:name=>{if(!modules[name])throw Error(name);return modules[name]},...extra});return module.exports;}
const chat=load('lib/chat.ts');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('messages accept Unicode emojis, photos or activities and reject empty/oversized content',()=>{
 assert.equal(chat.messageBody('  Olá 🏃🔥  ',false,null),'Olá 🏃🔥');assert.equal(chat.messageBody('',true,null),'');assert.equal(chat.messageBody('',false,'activity'),'');assert.throws(()=>chat.messageBody('   ',false,null));assert.throws(()=>chat.messageBody('a'.repeat(4001),false,null));
});
test('channel IDs come from database in required canonical order',async()=>{
 const client={from:()=>({select:()=>({in:()=>({abortSignal:async()=>({data:[{id:'2',name:'vitórias'},{id:'4',name:'eventos'},{id:'1',name:'geral'},{id:'3',name:'momentos'}],error:null})})})})};
 const result=await chat.readChannels(client,new AbortController().signal);assert.equal(result.map(c=>c.id).join(','),'1,2,3,4');
 const missing={from:()=>({select:()=>({in:()=>({abortSignal:async()=>({data:[],error:null})})})})};await assert.rejects(chat.readChannels(missing,new AbortController().signal));
});
function feedClient(rows,cap=20) {
 const calls=[];return {calls,from(table){assert.equal(table,'messages');let start=0,end=0,ids=null;return {select(){return this},eq(column,id){calls.push([column,id]);assert.equal(column,'channel_id');assert.equal(id,'geral-id');return this},in(column,value){assert.equal(column,'id');ids=value;return this},order(){return this},range(a,b){start=a;end=b;return this},async abortSignal(){const source=ids?rows.filter(m=>ids.includes(m.id)):rows;return {data:source.slice(start,Math.min(end+1,start+cap)),count:source.length,error:null}}}},rpc(name,params){assert.equal(name,'chat_reaction_summary');return {async abortSignal(){return {data:params.p_message_ids.map(id=>({message_id:id,emoji:'🔥',total:2400,mine:true})),error:null}}}}};
}
const author={id:owner,name:'Ana real',bio:'Bio real',avatar_url:null};
const message=(id,reply=null)=>({id,channel_id:'geral-id',author_id:owner,body:`Mensagem ${id}`,photo_url:null,activity_id:null,activity_card:null,reply_to:reply,pinned:false,created_at:'2026-11-18T12:00:00Z',author});
test('history is paginated beyond API caps and replies stay scoped to the same channel',async()=>{
 const rows=Array.from({length:120},(_,i)=>message(String(120-i)));rows[0].reply_to='1';const client=feedClient(rows);
 const result=await chat.readChatFeed(client,'geral-id',50,new AbortController().signal);assert.equal(result.messages.length,50);assert.equal(result.messages[0].id,'71');assert.equal(result.messages.at(-1).id,'120');assert.equal(result.hasOlder,true);assert.equal(result.messages.at(-1).reply.id,'1');assert.equal(result.messages.at(-1).author.name,'Ana real');assert.equal(result.reactions[0].total,2400);assert.ok(client.calls.length>=4);
});
test('empty channel contains no demo messages or reactions',async()=>{
 const result=await chat.readChatFeed(feedClient([]),'geral-id',50,new AbortController().signal);assert.equal(result.messages.length,0);assert.equal(result.reactions.length,0);assert.equal(result.hasOlder,false);
});
test('permission errors propagate and do not become an empty successful chat',async()=>{
 const client={from:()=>({select(){return this},eq(){return this},order(){return this},range(){return this},async abortSignal(){return {data:null,count:null,error:{message:'permission denied'}}}})};await assert.rejects(chat.readChatFeed(client,'geral-id',50,new AbortController().signal),e=>e.message==='permission denied');
});
test('reactions are limited to allowed emojis and deletes target only the current user',async()=>{
 const calls=[];const client={from(table){assert.equal(table,'reactions');return {insert:async row=>{calls.push(row);return {error:null}},delete(){const query={eq(column,value){calls.push([column,value]);return this},then(resolve){resolve({error:null})}};return query}}}};
 await chat.changeReaction(client,'msg',owner,'🔥',false);await chat.changeReaction(client,'msg',owner,'🔥',true);assert.equal(calls[0].user_id,owner);assert.equal(calls[0].emoji,'🔥');assert.equal(calls[2][0],'user_id');assert.equal(calls[2][1],owner);assert.equal(calls[3][1],'🔥');await assert.rejects(chat.changeReaction(client,'msg',owner,'😀',false));
});
test('a lost send response is recovered by stable message UUID without another insert',async()=>{
 let inserted=0;const payload={id:'msg-uuid',channel_id:'chan',author_id:owner,body:'Olá',photo_url:null,activity_id:null,reply_to:null};
 const client={from(){return {insert(row){inserted++;assert.equal(row.id,payload.id);return {select:()=>({single:async()=>({data:null,error:{message:'lost response'}})})}},select(){return this},eq(){return this},async maybeSingle(){return {data:{id:payload.id,photo_url:null},error:null}}}}};
 const result=await chat.sendChatMessage(client,payload);assert.equal(result.id,payload.id);assert.equal(inserted,1);
});
test('refresh queue coalesces concurrent events and preserves update order',async()=>{
 let release,loads=0;const gate=new Promise(resolve=>{release=resolve});const errors=[];const queue=chat.createRefreshQueue(async()=>{loads++;if(loads===1)await gate},error=>errors.push(error));const first=queue.request();await queue.request();await queue.request();release();await first;assert.equal(loads,2);assert.equal(errors.length,0);queue.stop();await queue.request();assert.equal(loads,2);
});
test('stopped subscriptions do not report late errors',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve});let errors=0;const queue=chat.createRefreshQueue(async()=>{await gate;throw Error('offline')},()=>{errors++});const first=queue.request();queue.stop();release();await first;assert.equal(errors,0);
});
test('chat photos use existing photos bucket and cleanup checks messages, not activities',async()=>{
 const policy=load('lib/image-policy.ts');const images=load('lib/images.ts',{}, {'./image-policy':policy});let table,removed=false;const client={storage:{from(bucket){assert.equal(bucket,'photos');return {upload:async()=>({error:null}),remove:async()=>{removed=true;return {error:null}}}}},from(name){table=name;return {select:()=>({eq:()=>({limit:async()=>({data:[],error:null})})})}}};
 const upload=await images.uploadImage(client,owner,{blob:new Blob(['abc'],{type:'image/jpeg'}),kind:'chat',width:2,height:2,originalBytes:3});assert.equal(policy.parseImageRef(upload.reference).bucket,'photos');await images.removeUnusedImage(client,upload.reference,owner);assert.equal(table,'messages');assert.equal(removed,true);
});
test('SQL migration starts in SQL and ends in commit, without prompt text',()=>{
 const source=fs.readFileSync('supabase/migrations/004_chat_realtime.sql','utf8');const lines=source.trim().split(/\r?\n/);assert.equal(lines[0],'-- Fase 4: chat em tempo real. Executar depois das fases 1, 2 e 3. Seguro repetir.');assert.equal(lines[1],'begin;');assert.equal(lines.at(-1),'commit;');assert.ok(!source.includes('Fase 3 testada e a funcionar'));
});

test('all pinned messages are fetched independently of the latest 50-message history window',async()=>{
 const rows=Array.from({length:106},(_,i)=>({...message('pinned-'+i),pinned:true}));let filters=0;
 const client={from:()=>({select(){return this},eq(column,value){if(column==='pinned')assert.equal(value,true);else assert.equal(value,'geral-id');filters++;return this},order(){return this},range(start,end){this.start=start;this.end=end;return this},async abortSignal(){return {data:rows.slice(this.start,Math.min(this.end+1,this.start+7)),count:rows.length,error:null}}})};
 const result=await chat.readPinnedMessages(client,'geral-id',new AbortController().signal);assert.equal(result.length,106);assert.ok(filters>2);
});
