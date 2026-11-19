const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(path) {
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,Date,Set,Math,Number,Error,Infinity});
  return module.exports;
}
const {summarize,monday,shiftDay,paceText,timeText}=load('lib/activity-stats.ts');
const {readOwnActivities}=load('lib/activity-repository.ts');
const act=(date,distance,duration,elevation=0,type='Corrida')=>({id:date,user_id:'owner',type,date,distance,duration,elevation,notes:''});
const sample=[act('2026-11-18',5,1800,10),act('2026-11-16',3,2160,20,'Caminhada'),act('2026-11-09',10,3000,100),act('2026-11-02',6,2880,60,'Trail Run')];
test('zero activities has no invented records or streak',()=>{
 const s=summarize([],'2026-11-18'); assert.equal(s.allTime.count,0);assert.equal(s.weekly.distance,0);assert.equal(s.streak,0);assert.equal(s.bestPace,null);assert.equal(s.longest,null);assert.equal(s.chart.length,12);assert.ok(s.chart.every(p=>p.km===0));
});
test('real totals, weekly comparison, chart and personal records',()=>{
 const s=summarize(sample,'2026-11-18');assert.equal(s.weekly.distance,8);assert.equal(s.weekly.duration,3960);assert.equal(s.weekly.elevation,30);assert.equal(s.previous.distance,10);assert.equal(s.allTime.distance,24);assert.equal(s.allTime.duration,9840);assert.equal(s.allTime.elevation,190);assert.equal(s.streak,3);assert.equal(s.bestPace,300);assert.equal(s.longest,10);assert.equal(s.chart[11].km,8);assert.equal(s.chart[10].km,10);assert.equal(s.chart[9].km,6);assert.equal(s.days.filter(Boolean).length,2);
});
test('sport filter changes every calculation',()=>{
 const s=summarize(sample,'2026-11-18',0,'Corrida');assert.equal(s.allTime.distance,15);assert.equal(s.weekly.distance,5);assert.equal(s.weekly.duration,1800);assert.equal(s.weekly.elevation,10);assert.equal(s.streak,2);assert.equal(s.chart[9].km,0);assert.equal(s.days.filter(Boolean).length,1);
});
test('selected week changes chart and weekly data, current streak stays current',()=>{
 const s=summarize(sample,'2026-11-18',-1);assert.equal(s.start,'2026-11-09');assert.equal(s.end,'2026-11-15');assert.equal(s.weekly.distance,10);assert.equal(s.chart[11].km,10);assert.equal(s.streak,3);
});
test('streak permits empty current week, breaks on gap, ignores future entries',()=>{
 assert.equal(summarize(sample.slice(2),'2026-11-18').streak,2);
 assert.equal(summarize([sample[0],sample[3]],'2026-11-18').streak,1);
 assert.equal(summarize([sample[3]],'2026-11-18').streak,0);
 assert.equal(summarize([act('2026-11-19',99,100)],'2026-11-18').allTime.count,0);
});
test('Monday weeks work across year/month boundaries and DST',()=>{
 assert.equal(monday('2027-01-01'),'2026-12-28');assert.equal(shiftDay('2026-12-28',6),'2027-01-03');assert.equal(monday('2026-03-29'),'2026-03-23');assert.equal(shiftDay('2026-03-23',7),'2026-03-30');
});
test('pace and durations retain seconds and carry correctly',()=>{
 assert.equal(paceText(359.8),'6:00');assert.equal(paceText(null),'—');assert.equal(timeText(3960),'1h 06min 00s');
});
function fakeClient(rows,cap=500,error=null) {
 const calls=[];const client={from(table){assert.equal(table,'activities');let start,end;return {
 select(fields,opts){assert.equal(opts.count,'exact');return this},
 eq(column,id){assert.equal(column,'user_id');assert.equal(id,'owner');return this},
 order(){return this},range(a,b){start=a;end=b;calls.push([a,b]);return this},
 async abortSignal(){return {data:rows.slice(start,Math.min(end+1,start+cap)),count:rows.length,error}}
 }}};return {client,calls};
}
test('loads entire owner history past API cap and normalizes numeric values',async()=>{
 const rows=Array.from({length:1203},(_,i)=>({...sample[0],id:String(i),distance:'1.25'}));const {client,calls}=fakeClient(rows,100);
 const result=await readOwnActivities(client,'owner',new AbortController().signal);assert.equal(result.length,1203);assert.equal(calls.length,13);assert.equal(result[0].distance,1.25);assert.equal(summarize(result,'2026-11-18').allTime.distance,1503.75);
});
test('empty database returns no samples; database permission errors propagate',async()=>{
 const empty=fakeClient([]);assert.equal((await readOwnActivities(empty.client,'owner',new AbortController().signal)).length,0);
 const denied=fakeClient([],500,{message:'permission denied for table activities'});await assert.rejects(readOwnActivities(denied.client,'owner',new AbortController().signal),e=>e.message.includes('permission denied'));
});
