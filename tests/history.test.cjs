const {test}=require('node:test');const assert=require('node:assert/strict');require('../salon-history.js');const H=globalThis.SalonHistory;
test('date presets cross months and years; custom dates inclusive',()=>{
 assert.deepEqual(H.range('yesterday','','',new Date(2026,0,1)),['2025-12-31','2025-12-31']);
 assert.deepEqual(H.range('lastWeek','','',new Date(2026,9,27)),['2026-10-19','2026-10-25']);
 assert.deepEqual(H.range('lastMonth','','',new Date(2026,0,3)),['2025-12-01','2025-12-31']);
 assert.equal(H.within('2026-10-27',['2026-10-27','2026-10-27']),true);
 assert.throws(()=>H.range('custom','2026-11-01','2026-10-01'));
});
test('restore keeps app conflicts, adds missing rows once, preserves settings and auth',()=>{
 const cur={clients:[{id:'1',name:'current'},{id:'2'}],invoices:[{id:'i1',total:20}],settings:{name:'current'},auth:{user:'owner'},_deleted:{'3':123}};
 const backup={clients:[{id:'1',name:'old'},{id:'3'},{id:'3'}],invoices:[{id:'i1',total:5},{id:'i2',total:10}],settings:{name:'old'},auth:{user:'other'}};
 const merged=H.merge(cur,backup);assert.equal(merged.added,2);assert.equal(merged.state.clients[0].name,'current');assert.equal(merged.state.clients.length,3);assert.equal(merged.state.invoices[0].total,20);assert.deepEqual(merged.state.auth,cur.auth);assert.deepEqual(merged.state.settings,cur.settings);assert.equal(H.merge(merged.state,backup).added,0);assert.equal(cur.clients.length,2);assert.throws(()=>H.merge(cur,{clients:[{}]}));
});
test('cash reports separate deposit date from invoice and subtract applied deposit',()=>{
 const s={invoices:[{date:'2026-10-27',total:100,paid:100,depositApplied:30}],appointments:[{date:'2026-10-27',depositDate:'2026-10-20',depositPaid:30,status:'completed'}],debtPayments:[{date:'2026-10-27',amount:10}],expenses:[{date:'2026-10-27',amount:20},{date:'2026-10-01',amount:50}]};
 assert.equal(H.financials(s,['2026-10-27','2026-10-27']).totalCollected,80);assert.equal(H.financials(s,['2026-10-27','2026-10-27']).netCashProfit,60);assert.equal(H.financials(s,['','']).totalCollected,110);
});
test('archive contains only aged transactions and gzip restores identically',async()=>{
 const s={clients:[{id:'c'}],invoices:[{id:'old',date:'2024-10-26'},{id:'boundary',date:'2025-10-27'},{id:'new',date:'2026-10-27'}]};const a=H.oldData(s,new Date(2026,9,27));assert.deepEqual(a.data.invoices.map(x=>x.id),['old']);assert.deepEqual(await H.decode(await H.encode(a)),a);assert.equal(s.invoices.length,3);
});
