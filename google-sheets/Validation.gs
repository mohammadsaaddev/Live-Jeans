const sum=a=>a.reduce((x,y)=>x+Number(y||0),0),key=s=>s.trim().toLowerCase();
function billTotal(b){return sum(b.lines.map(l=>l.pieces*l.ratePaise))}
function validDate(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d}
function validateLedger(n){
 const fail=m=>{throw Error('Invalid backup: '+m)},num=(v,min=0)=>typeof v==='number'&&Number.isFinite(v)&&v>=min,whole=v=>num(v)&&Number.isSafeInteger(v),str=v=>typeof v==='string',id=v=>str(v)&&/^[A-Za-z0-9_-]{1,100}$/.test(v),date=v=>str(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!n||n.version!==1)fail('unsupported version');for(const k of ['lots','master','workers','jobs','payments'])if(!Array.isArray(n[k]))fail(k);for(const k of ['openings','history','removed','parties','bills','receipts','assignments','challans'])if(n[k]!==undefined&&!Array.isArray(n[k]))fail(k);
 if(n.workers.some(w=>!str(w)||!w.trim())||new Set(n.workers).size!==n.workers.length)fail('worker names');if(n.master.some(l=>!str(l.number)||!l.number.trim()||!whole(l.pieces))||new Set(n.master.map(l=>l.number)).size!==n.master.length)fail('lot master');
 for(const l of n.lots){if(!str(l.number)||!Array.isArray(l.ratio)||l.ratio.length!==8||!Array.isArray(l.rolls))fail('cutting lot');for(const x of l.ratio){let p=String(x).split('/');if(p.length>2||p.some(v=>v.trim()===''||!Number.isFinite(Number(v)))||Number(p[0])<0||(p.length===2&&Number(p[1])<=0))fail('ratio')}for(const r of l.rolls){if(!str(r.number)||!whole(r.layers)||!whole(r.extra)||!(r.metres===null||r.metres===''||num(r.metres))||!Array.isArray(r.sizes)||r.sizes.length!==8||r.sizes.some(v=>!whole(v))||(r.override&&(!Array.isArray(r.override)||r.override.length!==8||r.override.some(v=>!whole(v)))))fail('roll');}}
 for(const j of n.jobs)if(!id(j.id)||!n.workers.includes(j.worker)||!n.master.some(l=>l.number===j.lot)||!str(j.operation)||!date(j.date)||j.month!==j.date.slice(0,7)||!whole(j.pieces)||j.pieces<=0||!num(j.rate))fail('work entry');for(const p of n.payments)if(!id(p.id)||!n.workers.includes(p.worker)||!date(p.date)||p.month!==p.date.slice(0,7)||!num(p.amount)||!['Kharchi','Salary payment'].includes(p.kind))fail('payment');
 for(const o of n.openings||[])if(!n.workers.includes(o.worker)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(o.month)||!num(o.amount,-Number.MAX_SAFE_INTEGER))fail('opening balance');
 for(const p of n.parties||[])if(!id(p.id)||!str(p.name)||!p.name.trim())fail('party');
 for(const c of [...(n.challans||[]),...(n.bills||[])]){if(!id(c.id)||!str(c.number)||!date(c.date)||!c.party?.name||!c.business?.name||!(n.parties||[]).some(p=>p.id===c.partyId)||!Array.isArray(c.lines)||!c.lines.length)fail('bill / challan');for(const l of c.lines)if(!n.master.some(m=>m.number===l.lot)||!whole(l.pieces)||l.pieces<=0)fail('bill / delivery quantity');if(c.challanIds&&(!Array.isArray(c.challanIds)||c.challanIds.some(id=>!(n.challans||[]).some(ch=>ch.id===id&&ch.partyId===c.partyId))))fail('delivery reference')}
 for(const b of n.bills||[])if(b.lines.some(l=>!whole(l.ratePaise)))fail('bill price');for(const p of n.receipts||[])if(!id(p.id)||!date(p.date)||!whole(p.amountPaise)||p.amountPaise<=0||!(n.bills||[]).some(b=>b.id===p.billId))fail('receipt');
 for(const a of n.assignments||[])if(!n.workers.includes(a.worker)||!n.master.some(l=>l.number===a.lot)||!str(a.operation)||!whole(a.pieces)||a.pieces<=0)fail('assignment');
 for(const k of ['jobs','payments','parties','bills','receipts','challans']){let rows=n[k]||[];if(new Set(rows.map(x=>x.id)).size!==rows.length)fail('duplicate '+k+' IDs')}
 for(const x of n.removed||[]){if(!['jobs','payments'].includes(x.type)||!x.entry||!id(x.entry.id)||!n.workers.includes(x.entry.worker))fail('removed entry')}
 if(n.business!==undefined&&(!n.business||!str(n.business.name)))fail('business');return n;
}

function salarySnapshot(state,through){return JSON.stringify({jobs:state.jobs.filter(j=>j.month<=through).map(j=>[j.id,j.worker,j.month,j.date,j.lot,j.operation,j.pieces,j.rate]).sort((a,b)=>a[0].localeCompare(b[0])),payments:state.payments.filter(p=>p.month<=through).map(p=>[p.id,p.worker,p.month,p.date,p.kind,p.amount,p.note||'']).sort((a,b)=>a[0].localeCompare(b[0])),openings:(state.openings||[]).filter(o=>o.month<=through).map(o=>[o.worker,o.month,o.amount,o.note||'']).sort((a,b)=>a[0].localeCompare(b[0]))})}

function partyEvents(partyId,state=db){let out=[],add=e=>out.push(e);let o=(state.partyOpenings||[]).find(o=>o.partyId===partyId);if(o)add({date:o.date,type:'Opening balance',ref:'Opening',detail:o.note,debit:Math.max(0,o.amountPaise),credit:Math.max(0,-o.amountPaise),order:0});
 for(const c of state.challans||[])if(c.partyId===partyId&&!c.cancelled)add({date:c.date,type:'Delivery',ref:c.number,detail:c.lines.map(l=>`${l.lot}: ${l.pieces} pcs`).join(', '),debit:0,credit:0,order:1});
 for(const b of state.bills||[])if(b.partyId===partyId&&!b.cancelled)add({date:b.date,type:'Bill',ref:b.number,detail:b.challanIds?.length?'Against delivery challans':'Jeans supplied directly',debit:billTotal(b),credit:0,order:2});
 for(const r of state.returns||[])if(r.partyId===partyId&&!r.cancelled)add({date:r.date,type:'Return / credit',ref:r.number,detail:`Lot ${r.lot} · ${r.pieces} pcs · ${r.reason}`,debit:0,credit:r.pieces*r.ratePaise,order:3});
 for(const p of state.receipts||[]){let b=state.bills.find(b=>b.id===p.billId);if(b?.partyId===partyId)add({date:p.date,type:'Payment received',ref:b.number,detail:p.note||'',debit:0,credit:p.amountPaise,order:4})}
 for(const p of state.partyPayments||[])if(p.partyId===partyId)add({date:p.date,type:p.kind==='Refund'?'Refund paid':'On-account receipt',ref:p.id.slice(0,8),detail:p.note||'',debit:p.kind==='Refund'?p.amountPaise:0,credit:p.kind==='Receipt'?p.amountPaise:0,order:5});
 return out.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order||a.ref.localeCompare(b.ref));}

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

const beforePaymentDetails=validateLedger;validateLedger=function(n){beforePaymentDetails(n);for(const p of n.payments)if(p.method!==undefined&&!['Cash','UPI','Bank transfer','Other'].includes(p.method)||p.reference!==undefined&&typeof p.reference!=='string')throw Error('Invalid payment details.');return n};
