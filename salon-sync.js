// Account-scoped cloud sync. Rebase only actual local changes onto the latest server revision.
(function(root) {
  const copy = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  function rebase(base, local, remote) {
    if (equal(base,local)) return copy(remote);
    if (local === undefined) return undefined;
    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote) &&
        [...base,...local,...remote].every(x => object(x) && x.id != null)) {
      const maps = [base,local,remote].map(a=>new Map(a.map(x=>[String(x.id),x])));
      return [...new Set([...maps[2].keys(),...maps[1].keys(),...maps[0].keys()])]
        .map(k=>rebase(maps[0].get(k),maps[1].get(k),maps[2].get(k))).filter(x=>x!==undefined);
    }
    if (object(base) && object(local) && object(remote)) {
      const out={};
      for (const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])) {
        const value=rebase(base[k],local[k],remote[k]);
        if (value!==undefined) out[k]=value;
      }
      return out;
    }
    return copy(local);
  }
  function create(io) {
    let observed=copy(io.get()), pending=[], chain=Promise.resolve(), account=null;
    function persist(){io.persist(account,pending);}
    function capture(){
      const after=copy(io.get());
      if (account && !equal(observed,after)) {pending.push({before:observed,after});persist();}
      observed=after;
    }
    function apply(remote){
      capture(); // Preserve edits made while a network request was in flight.
      let value=copy(remote);
      for(const change of pending) value=rebase(change.before,change.after,value);
      io.set(value);observed=copy(io.get());
    }
    async function run(){
      if(!account) throw new Error('سجّل الدخول أولاً');
      capture();
      for(let attempt=0;attempt<12;attempt++) {
        const row=await io.read();
        capture();
        if(!row) throw new Error('لم يتم تهيئة بيانات الصالون');
        if(!pending.length){apply(row.state_json);return true;}
        const count=pending.length;
        let value=copy(row.state_json);
        for(const change of pending.slice(0,count)) value=rebase(change.before,change.after,value);
        const saved=await io.commit(row.revision,value);
        if(!saved) continue; // Another session committed first: re-read and rebase.
        capture();
        pending.splice(0,count);persist();apply(saved.state_json);
        if(!pending.length) return true;
      }
      throw new Error('تعديلات متزامنة كثيرة؛ التغييرات محفوظة محلياً، أعد المحاولة');
    }
    return {
      capture,
      async login(id){
        if(account===id)return;
        await chain.catch(()=>{});
        account=id;pending=io.restore(id)||[];observed=copy(io.get());
      },
      sync(){const task=chain.then(run);chain=task.catch(()=>{});return task;},
      pending:()=>pending.length
    };
  }
  root.SalonSync={create,rebase};
})(typeof window==='undefined'?globalThis:window);
