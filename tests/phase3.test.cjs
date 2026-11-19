const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,extra={},modules={}) {
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,Blob,Date,Math,Number,Error,Promise,crypto:require('node:crypto').webcrypto,require:name=>{if(!modules[name])throw new Error(name);return modules[name]},...extra});return module.exports;
}
const policy=load('lib/image-policy.ts');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const ref=`storage://avatars/${owner}/33333333-3333-4333-8333-333333333333.jpg`;
test('input type, empty file and 10 MiB cap are enforced',()=>{
 assert.doesNotThrow(()=>policy.validateImage({type:'image/jpeg',size:policy.MAX_INPUT_BYTES}));
 for(const input of [{type:'image/svg+xml',size:20},{type:'image/gif',size:20},{type:'image/jpeg',size:0},{type:'image/jpeg',size:policy.MAX_INPUT_BYTES+1}])assert.throws(()=>policy.validateImage(input));
});
test('dimensions preserve portrait/landscape ratio, never enlarge, reject huge pixels',()=>{
 assert.equal(JSON.stringify(policy.scaledDimensions(4000,2000,512)),JSON.stringify({width:512,height:256}));
 assert.equal(policy.scaledDimensions(2000,4000,1920).height,1920);assert.equal(policy.scaledDimensions(100,80,512).width,100);
 assert.throws(()=>policy.scaledDimensions(10000,10000,512));assert.throws(()=>policy.scaledDimensions(0,20,512));
});
test('storage references accept only supported buckets and safe two-segment paths',()=>{
 assert.equal(policy.parseImageRef(ref).owner,owner);
 for(const value of ['https://example.com/photo.jpg','storage://photos/a/b.jpg',`storage://avatars/${owner}/../x.jpg`,`storage://avatars/${owner}/x.svg`])assert.equal(policy.parseImageRef(value),null);
});
function imageEnv(outputSize=1000) {
 const state={closed:false,calls:[],draws:[],background:[]};const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect:(...args)=>state.background.push(args),drawImage:(...args)=>state.draws.push(args)}),toBlob:(callback,type,quality)=>{state.calls.push({type,quality,width:canvas.width,height:canvas.height});callback(new Blob([new Uint8Array(typeof outputSize==='function'?outputSize(state.calls.length):outputSize)],{type}));}};
 const api=load('lib/images.ts',{createImageBitmap:async()=>({width:4000,height:2000,close:()=>{state.closed=true}}),document:{createElement:name=>{assert.equal(name,'canvas');return canvas}}},{'./image-policy':policy});return {api,state};
}
test('compression reencodes to JPEG within dimensions and byte limit, releases bitmap',async()=>{
 const {api,state}=imageEnv();const result=await api.prepareImage({type:'image/png',size:5000000},'avatar');assert.equal(result.blob.type,'image/jpeg');assert.equal(result.width,512);assert.equal(result.height,256);assert.ok(result.blob.size<=256*1024);assert.equal(state.closed,true);assert.equal(state.calls[0].type,'image/jpeg');assert.equal(state.background.length,1);
});
test('compression lowers quality and dimensions until under bucket cap',async()=>{
 const {api,state}=imageEnv(n=>n<7?300000:200000);const result=await api.prepareImage({type:'image/jpeg',size:800000},'avatar');assert.equal(state.calls.length,7);assert.ok(result.width<512);assert.equal(result.blob.size,200000);assert.equal(state.closed,true);
});
test('compression rejects an uncompressible image and releases resources',async()=>{
 const {api,state}=imageEnv(300000);await assert.rejects(api.prepareImage({type:'image/jpeg',size:800000},'avatar'));assert.equal(state.closed,true);
});
test('upload uses unique owner paths, correct bucket, JPEG and no upsert',async()=>{
 const {api}=imageEnv();const calls=[];const client={storage:{from:bucket=>({upload:async(path,blob,options)=>{calls.push({bucket,path,blob,options});return {error:null}}})}};
 const image={blob:new Blob(['test'],{type:'image/jpeg'}),width:512,height:256,originalBytes:10,kind:'avatar'};
 const first=await api.uploadImage(client,owner,image),second=await api.uploadImage(client,owner,image);assert.notEqual(first.path,second.path);assert.equal(calls[0].bucket,'avatars');assert.ok(first.path.startsWith(owner+'/'));assert.equal(calls[0].options.upsert,false);assert.equal(policy.parseImageRef(first.reference).path,first.path);
 await assert.rejects(api.uploadImage(client,owner,{...image,blob:new Blob([new Uint8Array(262145)],{type:'image/jpeg'})}));assert.equal(calls.length,2);
});
function cleanupClient(data,error=null){let removed=0;return {get removed(){return removed},from:()=>({select:()=>({eq:()=>({limit:async()=>({data,error})})})}),storage:{from:()=>({remove:async()=>{removed++;return {error:null}}})}};}
test('cleanup removes only unreferenced own images and retains referenced or uncertain ones',async()=>{
 const {api}=imageEnv();const unused=cleanupClient([]);assert.equal(await api.removeUnusedImage(unused,ref,owner),true);assert.equal(unused.removed,1);
 const used=cleanupClient([{id:owner}]);assert.equal(await api.removeUnusedImage(used,ref,owner),false);assert.equal(used.removed,0);
 const offline=cleanupClient(null,{message:'offline'});assert.equal(await api.removeUnusedImage(offline,ref,owner),false);assert.equal(offline.removed,0);
 const foreign=cleanupClient([]);await api.removeUnusedImage(foreign,ref,other);assert.equal(foreign.removed,0);
});
const social=load('lib/social.ts');
test('follow and unfollow are scoped to actor and target; cannot self-follow',async()=>{

 const calls=[];
 const client={from(table){
   assert.equal(table,'follows');
   return {
     async insert(value){calls.push(value);return {error:null}},
     delete(){return {eq(col,value){calls.push([col,value]);return {async eq(col,value){calls.push([col,value]);return {error:null}}}}}}
   };
 }};

 await social.changeFollow(client,owner,other,false);await social.changeFollow(client,owner,other,true);assert.equal(calls[0].follower_id,owner);assert.equal(calls[0].following_id,other);assert.equal(calls[1][0],'follower_id');assert.equal(calls[2][0],'following_id');await assert.rejects(social.changeFollow(client,owner,owner,false));
});
test('repeat follow is idempotent; permission failure is surfaced',async()=>{
 const client=code=>({from:()=>({insert:async()=>({error:{code,message:'denied'}})})});await social.changeFollow(client('23505'),owner,other,false);await assert.rejects(social.changeFollow(client('42501'),owner,other,false),e=>e.code==='42501');
});
test('follow counts use exact head queries, not truncated row lengths',async()=>{
 const client={from:()=>({select:(fields,options)=>{assert.equal(options.head,true);assert.equal(options.count,'exact');return {eq:(column,id)=>{assert.equal(id,owner);return {abortSignal:async()=>({count:column==='following_id'?2400:1800,error:null})}}}}})};
 const counts=await social.readFollowCounts(client,owner,new AbortController().signal);assert.equal(counts.followers,2400);assert.equal(counts.following,1800);
});
