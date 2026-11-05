const validateBeforeAccounts=validateLedger;
validateLedger=function(n){
 validateBeforeAccounts(n);
 const fail=m=>{throw Error('Invalid backup: '+m)},str=v=>typeof v==='string',whole=v=>Number.isSafeInteger(v)&&v>=0,party=id=>(n.parties||[]).some(p=>p.id===id);
 for(const k of ['partyOpenings','partyPayments','returns','salaryLocks'])if(n[k]!==undefined&&!Array.isArray(n[k]))fail(k);
 for(const k of ['partyPayments','returns']){let rows=n[k]||[];if(rows.some(r=>!str(r.id)||!r.id)||new Set(rows.map(r=>r.id)).size!==rows.length)fail(k+' IDs')}
 if(new Set((n.partyOpenings||[]).map(o=>o.partyId)).size!==(n.partyOpenings||[]).length)fail('duplicate party openings');
 for(const o of n.partyOpenings||[]){if(!party(o.partyId)||!validDate(o.date)||!Number.isSafeInteger(o.amountPaise)||!str(o.note))fail('party opening');if(partyEvents(o.partyId,n).some(e=>e.type!=='Opening balance'&&e.date<o.date))fail('transaction before party opening')}
 for(const p of n.partyPayments||[])if(!party(p.partyId)||!validDate(p.date)||!whole(p.amountPaise)||!p.amountPaise||!['Receipt','Refund'].includes(p.kind)||!str(p.note))fail('party receipt / refund');
 let quantities=new Map();
 for(const r of n.returns||[]){let b=(n.bills||[]).find(b=>b.id===r.billId),l=b?.lines[r.line];if(!b||b.cancelled||!whole(r.line)||!l||r.partyId!==b.partyId||r.lot!==l.lot||!validDate(r.date)||r.date<b.date||!whole(r.pieces)||!r.pieces||!whole(r.ratePaise)||r.ratePaise>l.ratePaise||!Number.isSafeInteger(r.pieces*r.ratePaise)||typeof r.restock!=='boolean'||!str(r.reason)||!str(r.number))fail('party return');if(!r.cancelled){let k=r.billId+':'+r.line;quantities.set(k,(quantities.get(k)||0)+r.pieces);if(quantities.get(k)>l.pieces)fail('returned quantity exceeds bill')}}
 let locks=n.salaryLocks||[];if(new Set(locks.map(l=>l.month)).size!==locks.length)fail('duplicate salary locks');
 for(const l of locks)if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(l.month)||!str(l.note)||!l.note.trim()||!str(l.closedAt)||!Number.isFinite(Date.parse(l.closedAt))||l.snapshot!==salarySnapshot(n,l.month))fail('closed salary month has changed');
 if(new Set(n.master.map(l=>key(l.number))).size!==n.master.length)fail('duplicate lot numbers');
 for(const l of n.master){for(const k of ['style','colour','note','date','partyId'])if(l[k]!==undefined&&!str(l[k]))fail('lot details');if(l.partyId&&!party(l.partyId))fail('lot party');if(l.date&&!validDate(l.date))fail('lot date')}
 return n;
};
function checkLockedRestore(n){for(const l of db.salaryLocks){let next=(n.salaryLocks||[]).find(x=>x.month===l.month);if(!next||next.snapshot!==l.snapshot||salarySnapshot(n,l.month)!==salarySnapshot(db,l.month))throw Error('Backup changes closed salary month '+l.month+'. Reopen that month before restoring.')}}
const restoreBeforeAccounts=restore;restore=async function(file){if(!file)return;try{let text=await file.text(),n=JSON.parse(text);validateLedger(n);checkLockedRestore(n);await restoreBeforeAccounts({text:async()=>text})}catch(e){alert(e.message)}};
const renderBeforeAccounts=render;render=function(){accountsInit();return renderBeforeAccounts()};
render();
