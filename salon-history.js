(function(root) {
  const keys=['clients','services','categories','invoices','appointments','debtPayments','expenses'];
  const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function range(period,from,to,now=new Date()) {
    const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()), start=new Date(end);
    if(period==='all')return ['', ''];
    if(period==='custom') {if(!from||!to||from>to)throw Error('اختاري تاريخ بداية ونهاية صحيحين');return [from,to];}
    if(period==='yesterday'){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);}
    if(period==='week')start.setDate(start.getDate()-6);
    if(period==='lastWeek'){start.setDate(start.getDate()-((start.getDay()+6)%7)-7);end.setTime(start.getTime());end.setDate(end.getDate()+6);}
    if(period==='month')start.setDate(1);
    if(period==='lastMonth'){start.setMonth(start.getMonth()-1,1);end.setDate(0);}
    if(period==='year')start.setMonth(0,1);
    return [day(start),day(end)];
  }
  const within=(value,r)=>{const date=String(value||'').slice(0,10);return !r[0]||(/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=r[0]&&date<=r[1]);};
  function financials(s,r) {
    const sum=(list,key)=>list.reduce((a,x)=>a+(Number(x[key])||0),0);
    const invoices=(s.invoices||[]).filter(x=>within(x.date,r));
    const expenses=(s.expenses||[]).filter(x=>within(x.date,r));
    const payments=(s.debtPayments||[]).filter(x=>within(x.date,r));
    const deposits=(s.appointments||[]).filter(x=>x.status!=='cancelled'&&within(x.depositDate||x.date,r));
    const totalBilled=sum(invoices,'total'),totalExpenses=sum(expenses,'amount');
    // Applied deposits were already received: never count them as new invoice cash.
    const totalCollected=invoices.reduce((a,x)=>a+Math.max(0,(Number(x.paid)||0)-(Number(x.depositApplied)||0)),0)+sum(payments,'amount')+sum(deposits,'depositPaid');
    return {totalBilled,totalExpenses,totalCollected,netCashProfit:totalCollected-totalExpenses,accruedNetProfit:totalBilled-totalExpenses};
  }
  function merge(current,input) {
    const source=input?.data||input?.state_json||input;
    if(!source||!Array.isArray(source.clients))throw Error('ملف النسخة غير صالح');
    const result=JSON.parse(JSON.stringify(current));let added=0,kept=0;
    for(const key of keys){
      if(source[key]!==undefined&&!Array.isArray(source[key]))throw Error('بيانات غير صالحة: '+key);
      const rows=source[key]||[];
      if(rows.some(x=>!x||typeof x!=='object'||Array.isArray(x)||!['string','number'].includes(typeof x.id)||String(x.id)===''))throw Error('سجل بلا معرّف صالح');
      const ids=new Set((result[key]||[]).map(x=>String(x.id)));
      result[key]=result[key]||[];
      for(const row of rows){if(ids.has(String(row.id))){kept++;continue;}
        result[key].push(JSON.parse(JSON.stringify(row)));ids.add(String(row.id));added++;
        // Explicit restore can bring back a missing, previously deleted record.
        if(result._deleted)delete result._deleted[row.id];
      }
    }
    return {state:result,added,kept};
  }
  async function encode(value){return new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();}
  async function decode(file){
    const magic=new Uint8Array(await file.slice(0,2).arrayBuffer());
    const text=magic[0]===31&&magic[1]===139?await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text():await file.text();
    return JSON.parse(text);
  }
  function oldData(s,now=new Date()){
    const cutoff=new Date(now);cutoff.setFullYear(cutoff.getFullYear()-1);
    const data={};for(const key of keys)data[key]=['clients','services','categories'].includes(key)?s[key]||[]:(s[key]||[]).filter(x=>/^\d{4}-\d{2}-\d{2}/.test(x.date||'')&&x.date.slice(0,10)<day(cutoff));
    return {format:'salon-archive',version:1,createdAt:now.toISOString(),cutoff:day(cutoff),data};
  }
  async function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('salon-local-archives',1);req.onupgradeneeded=()=>req.result.createObjectStore('archives');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function storage(key,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('archives',value===undefined?'readonly':'readwrite');const req=value===undefined?tx.objectStore('archives').get(key):tx.objectStore('archives').put(value,key);tx.oncomplete=()=>{db.close();resolve(req.result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('تعذّر حفظ الأرشيف'));};});}
  root.SalonHistory={keys,day,range,within,financials,merge,encode,decode,oldData,storage};
})(typeof window==='undefined'?globalThis:window);
