const DATABASE_ID = '1LTKFqQWC4byI-tqCP8ssmgOlYyIKN7_8IDy5go0yFnA';
const OWNER_EMAIL = 'mohdsaad.work3@gmail.com';
function locked_(fn){const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('Another save is running. Please retry shortly.');try{return fn()}finally{lock.releaseLock()}}
function sheetRows_(title){const s=SpreadsheetApp.openById(DATABASE_ID).getSheetByName(title);return s&&s.getLastRow()?s.getDataRange().getValues():[];}
function encode_(data){return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(data))).getBytes())}
function decode_(text){return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(text))).getDataAsString())}
function read_(){const rows=sheetRows_('_State');if(!rows.length)return {revision:0,data:null,operationId:''};const meta=JSON.parse(rows[0][0]),text=rows.slice(1).map(r=>r[0]).join('');return {...meta,data:decode_(text)}}
function loadLedger_(){return locked_(()=>{const r=read_();if(r.data)validateLedger(r.data);return r})}
function backups_(){const rows=sheetRows_('_Backups'),out=[];for(const r of rows){if(!r[0])continue;let last=out[out.length-1];if(!last||last.revision!==r[0]){last={revision:r[0],time:r[1],text:''};out.push(last)}last.text+=r[2]}return out}
function listLedgerBackups_(){return locked_(()=>backups_().map(b=>({revision:b.revision,time:b.time})))}
function getLedgerBackup_(revision){return locked_(()=>{const b=backups_().find(b=>b.revision===revision);if(!b)throw Error('Backup no longer available.');return decode_(b.text)})}
function chunks_(text){return text.match(/.{1,30000}/g)||['']}
function transition_(old,next){
 if(!old)return;
 for(const lock of old.salaryLocks||[]){const kept=(next.salaryLocks||[]).find(l=>l.month===lock.month);if(kept){if(kept.snapshot!==lock.snapshot||salarySnapshot(next,lock.month)!==salarySnapshot(old,lock.month))throw Error('Closed salary records cannot change. Reopen the month first.')}else{const reason=(next.history||[]).some(h=>h.action==='Salary month reopened'&&h.details?.startsWith(lock.month+': ')&&h.details.slice(9).trim()&&!(old.history||[]).some(o=>o.at===h.at&&o.action===h.action&&o.details===h.details));if(!reason||(next.salaryLocks||[]).some(l=>l.month>lock.month)||salarySnapshot(next,lock.month)!==salarySnapshot(old,lock.month))throw Error('Reopen the salary month separately, with a reason, before editing records.')}}
}
function value_(v){if(v===null||v===undefined)return {};if(typeof v==='number')return {userEnteredValue:{numberValue:v}};if(typeof v==='boolean')return {userEnteredValue:{boolValue:v}};return {userEnteredValue:{stringValue:typeof v==='object'?JSON.stringify(v):String(v)}}}
function view_(data,key,columns){return [columns,...(data[key]||[]).map(r=>columns.map(c=>typeof r==='string'?(c==='name'?r:''):r[c]??''))]}
function saveLedger_(payload){return locked_(()=>{
 if(!payload||typeof payload.operationId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(payload.operationId)||!Number.isSafeInteger(payload.revision))throw Error('Invalid save request.');
 const current=read_();if(current.operationId===payload.operationId)return {revision:current.revision};
 if(current.revision!==payload.revision)throw Error('CONFLICT: Another device saved newer records. Download your changes before loading the latest version.');
 const data=validateLedger(payload.data);transition_(current.data,data);
 const packed=encode_(data);if(packed.length>1500000)throw Error('Database is too large for this version. Download a backup and ask for a database upgrade.');
 const now=new Date().toISOString(),revision=current.revision+1,old=backups_();if(current.data)old.unshift({revision:current.revision,time:current.time||now,text:encode_(current.data)});
 const tabs={
 '_State':[[JSON.stringify({revision,time:now,operationId:payload.operationId})],...chunks_(packed).map(s=>[s])],
 '_Backups':old.slice(0,5).flatMap(b=>chunks_(b.text).map(s=>[b.revision,b.time,s])),
 'Lots':view_(data,'master',['number','pieces','partyId','style','colour','date','note']),
 'Karigars':view_(data,'workers',['name']),
 'Work':view_(data,'jobs',['id','date','month','worker','lot','operation','pieces','rate']),
 'Salary payments':view_(data,'payments',['id','date','month','worker','kind','amount','note']),
 'Parties':view_(data,'parties',['id','name','phone','address']),
 'Bills':view_(data,'bills',['id','number','date','partyId','due','lines','cancelled']),
 'Deliveries':view_(data,'challans',['id','number','date','partyId','lines','cancelled']),
 'Receipts':view_(data,'receipts',['id','billId','date','amountPaise','note']),
 'Party payments':view_(data,'partyPayments',['id','partyId','date','kind','amountPaise','note']),
 'Returns':view_(data,'returns',['id','number','date','partyId','billId','lot','pieces','ratePaise','restock','reason']),
 'Party openings':view_(data,'partyOpenings',['partyId','date','amountPaise','note']),
 'Salary openings':view_(data,'openings',['worker','month','amount','note']),
 'Closed months':view_(data,'salaryLocks',['month','closedAt','note']),
 'Assignments':view_(data,'assignments',['lot','operation','worker','pieces','note']),
 'Cutting':view_(data,'lots',['number','ratio','rolls']),
 'History':view_(data,'history',['at','action','details'])
 };
 const sheets=SpreadsheetApp.openById(DATABASE_ID).getSheets(),byName=Object.fromEntries(sheets.map(s=>[s.getName(),{id:s.getSheetId(),rows:s.getMaxRows(),cols:s.getMaxColumns()}]));let id=Math.max(0,...sheets.map(s=>s.getSheetId()))+1,requests=[];
 for(const [title,rows] of Object.entries(tabs)){const cols=Math.max(1,...rows.map(r=>r.length)),height=Math.max(rows.length,1);let s=byName[title];if(!s){s={id:id++,rows:height,cols};requests.push({addSheet:{properties:{sheetId:s.id,title,hidden:title.startsWith('_'),gridProperties:{rowCount:height,columnCount:cols,frozenRowCount:title.startsWith('_')?0:1}}}})}else if(height>s.rows||cols>s.cols)requests.push({updateSheetProperties:{properties:{sheetId:s.id,gridProperties:{rowCount:Math.max(height,s.rows),columnCount:Math.max(cols,s.cols)}},fields:'gridProperties.rowCount,gridProperties.columnCount'}});
 requests.push({updateCells:{range:{sheetId:s.id},rows:rows.map(r=>({values:r.map(value_)})),fields:'userEnteredValue'}});
 if(!title.startsWith('_')){requests.push({repeatCell:{range:{sheetId:s.id,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{backgroundColor:{red:.93,green:.93,blue:.93},textFormat:{bold:true}}},fields:'userEnteredFormat'}});requests.push({updateDimensionProperties:{range:{sheetId:s.id,dimension:'COLUMNS',startIndex:0,endIndex:cols},properties:{pixelSize:160},fields:'pixelSize'}})}
 }
 const intro=byName['Start here'];if(intro)requests.push({updateCells:{start:{sheetId:intro.id,rowIndex:1,columnIndex:1},rows:[{values:[value_('Connected — last saved '+now)]}],fields:'userEnteredValue'}});
 // One atomic commit includes the state, revision, previous version and readable tabs.
 Sheets.Spreadsheets.batchUpdate({requests},DATABASE_ID);
 return {revision,time:now};
})}

function reply_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}
function doGet(){return reply_({ok:false,status:403,error:'Use the signed-in workshop app.'})}
function doPost(e){try{
 const secret=PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
 if(!secret||secret.length<32)throw Error('AUTH');
 const raw=e?.postData?.contents;if(typeof raw!=='string'||raw.length>2500000)throw Error('AUTH');
 const envelope=JSON.parse(raw);if(typeof envelope.message!=='string'||typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature))throw Error('AUTH');
 const signature=Utilities.computeHmacSha256Signature(envelope.message,secret,Utilities.Charset.UTF_8).map(b=>((b+256)%256).toString(16).padStart(2,'0')).join('');let diff=0;for(let i=0;i<64;i++)diff|=signature.charCodeAt(i)^envelope.signature.charCodeAt(i);if(diff)throw Error('AUTH');
 const request=JSON.parse(envelope.message);if(!Number.isFinite(request.timestamp)||Math.abs(Date.now()-request.timestamp)>300000||!request.actor?.email||!['owner','viewer'].includes(request.actor.role))throw Error('AUTH');
 const isOwner=request.actor.role==='owner'&&request.actor.email.toLowerCase()===OWNER_EMAIL;
 let data;if(request.action==='load')data=loadLedger_();else if(request.action==='save'&&isOwner)data=saveLedger_(request.payload);else if(request.action==='backups'&&isOwner)data=listLedgerBackups_();else if(request.action==='backup'&&isOwner)data=getLedgerBackup_(request.payload.revision);else throw Error('AUTH');
 return reply_({ok:true,data});
 }catch(e){const message=String(e.message||'Connection unavailable');return reply_({ok:false,status:message==='AUTH'?403:message.startsWith('CONFLICT:')?409:400,error:message==='AUTH'?'Request not authorised.':message})}}
