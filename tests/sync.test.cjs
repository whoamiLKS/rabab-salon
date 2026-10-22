const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../salon-sync.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const initial={clients:[{id:'a',name:'Old',phone:'1',updatedAt:100}],settings:{name:'Salon',phone:'1'}};
function fixture(){
 let row={state_json:clone(initial),revision:1}, failures=false, hook;
 const disk={};
 function device(){
  let state=clone(initial);
  const sync=SalonSync.create({get:()=>state,set:s=>state=s,persist:(id,p)=>disk[id]=clone(p),restore:id=>clone(disk[id]||[]),
   read:async()=>{if(failures)throw Error('offline');return clone(row)},
   commit:async(rev,v)=>{if(hook){const h=hook;hook=null;h();}await Promise.resolve();if(rev!==row.revision)return null;row={state_json:clone(v),revision:rev+1};return clone(row)}});
  return {sync,get:()=>state,edit:fn=>{fn(state);sync.capture()}};
 }
 return {device,row:()=>row,offline:v=>failures=v,hook:f=>hook=f,disk};
}
test('a settings change survives polling and appears in another session',async()=>{
 const f=fixture(),a=f.device(),b=f.device();await a.sync.login('a');await b.sync.login('b');
 a.edit(s=>s.settings.name='New');await a.sync.sync();await b.sync.sync();
 assert.equal(b.get().settings.name,'New');await b.sync.sync();assert.equal(f.row().state_json.settings.name,'New');
});
test('two simultaneous sessions preserve independent field edits using revision retry',async()=>{
 const f=fixture(),a=f.device(),b=f.device();await a.sync.login('a');await b.sync.login('b');
 a.edit(s=>s.clients[0].name='Alice');b.edit(s=>s.clients[0].phone='2');
 await Promise.all([a.sync.sync(),b.sync.sync()]);await a.sync.sync();
 assert.equal(a.get().clients[0].name,'Alice');assert.equal(a.get().clients[0].phone,'2');
});
test('deletion is not resurrected by an unchanged stale session',async()=>{
 const f=fixture(),a=f.device(),b=f.device();await a.sync.login('a');await b.sync.login('b');
 a.edit(s=>s.clients=[]);await a.sync.sync();b.edit(s=>s.settings.phone='3');await b.sync.sync();
 assert.deepEqual(f.row().state_json.clients,[]);
});
test('edits made during a pending save are committed before success',async()=>{
 const f=fixture(),a=f.device();await a.sync.login('a');a.edit(s=>s.clients[0].name='First');
 f.hook(()=>a.edit(s=>s.clients[0].name='Second'));await a.sync.sync();
 assert.equal(f.row().state_json.clients[0].name,'Second');assert.equal(a.sync.pending(),0);
});
test('offline edits survive reload and retry; stale initial cache does not overwrite cloud',async()=>{
 const f=fixture(),a=f.device();await a.sync.login('a');a.edit(s=>s.settings.name='Offline');
 f.offline(true);await assert.rejects(a.sync.sync());f.offline(false);
 const recovered=f.device();await recovered.sync.login('a');await recovered.sync.sync();
 const fresh=f.device();await fresh.sync.login('b');await fresh.sync.sync();
 assert.equal(fresh.get().settings.name,'Offline');assert.equal(f.row().state_json.settings.name,'Offline');
});
