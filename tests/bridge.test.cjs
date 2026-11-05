const fs=require('fs'),vm=require('vm'),assert=require('assert'),zlib=require('zlib');
const root=require('path').join(__dirname,'../google-sheets/');
let account='mohdsaad.work3@gmail.com',failCommit=false,locked=false,commits=0,tabs={'Start here':{id:1,rows:[['Status','Awaiting import']],height:1000,width:26}};
const blob=value=>({getBytes:()=>Buffer.from(value),getDataAsString:()=>Buffer.from(value).toString()});
let c={console,Date,Session:{getActiveUser:()=>({getEmail:()=>account})},Utilities:{newBlob:v=>blob(v),gzip:b=>blob(zlib.gzipSync(b.getBytes())),ungzip:b=>blob(zlib.gunzipSync(b.getBytes())),base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:s=>Buffer.from(s,'base64')},LockService:{getScriptLock:()=>({tryLock:()=>{assert(!locked);locked=true;return true},releaseLock:()=>locked=false})}};
function wrap(name,t){return {getName:()=>name,getSheetId:()=>t.id,getMaxRows:()=>t.height,getMaxColumns:()=>t.width,getLastRow:()=>t.rows.length,getDataRange:()=>({getValues:()=>structuredClone(t.rows)})}}
c.SpreadsheetApp={openById:()=>({getSheetByName:name=>tabs[name]?wrap(name,tabs[name]):null,getSheets:()=>Object.entries(tabs).map(([n,t])=>wrap(n,t))})};
c.Sheets={Spreadsheets:{batchUpdate:({requests})=>{if(failCommit)throw Error('Simulated network failure');let draft=structuredClone(tabs);for(const r of requests){if(r.addSheet){let p=r.addSheet.properties;draft[p.title]={id:p.sheetId,rows:[],height:p.gridProperties.rowCount,width:p.gridProperties.columnCount}}if(r.updateSheetProperties){let p=r.updateSheetProperties.properties,t=Object.values(draft).find(t=>t.id===p.sheetId);t.height=p.gridProperties.rowCount;t.width=p.gridProperties.columnCount}if(r.updateCells){let p=r.updateCells,t=Object.values(draft).find(t=>t.id===(p.range||p.start).sheetId),rows=p.rows.map(r=>r.values.map(v=>v.userEnteredValue?Object.values(v.userEnteredValue)[0]:''));if(p.range)t.rows=rows;else for(let i=0;i<rows.length;i++){let n=p.start.rowIndex+i;t.rows[n]??=[];rows[i].forEach((v,j)=>t.rows[n][p.start.columnIndex+j]=v)}}}tabs=draft;commits++;return {}}}};
vm.createContext(c);for(const f of ['Validation.gs','Code.gs'])vm.runInContext(fs.readFileSync(root+f,'utf8'),c,{filename:f});const run=s=>vm.runInContext(s,c);
const base={version:1,lots:[],master:[{number:'A',pieces:100}],workers:['Ali'],jobs:[],payments:[],history:[],openings:[],salaryLocks:[],parties:[],bills:[],receipts:[],challans:[],partyPayments:[],returns:[],partyOpenings:[],assignments:[]};
c.data=structuredClone(base);assert.equal(run('loadLedger_().revision'),0);assert.equal(run(`saveLedger_({data,revision:0,operationId:'first'}).revision`),1);assert.equal(run(`saveLedger_({data,revision:0,operationId:'first'}).revision`),1);assert.equal(commits,1);assert.throws(()=>run(`saveLedger_({data,revision:0,operationId:'stale'})`),/CONFLICT/);assert.deepEqual(JSON.parse(JSON.stringify(run('loadLedger_().data'))),base);
run(`data.jobs.push({id:'job1',worker:'Ali',lot:'A',operation:'Top',date:'2026-11-01',month:'2026-11',pieces:10,rate:3});data.salaryLocks.push({month:'2026-11',closedAt:new Date().toISOString(),note:'Checked',snapshot:salarySnapshot(data,'2026-11')});saveLedger_({data,revision:1,operationId:'second'})`);
assert.equal(run('listLedgerBackups_().length'),1);assert.equal(run('getLedgerBackup_(1).jobs.length'),0);
c.bad=structuredClone(run('data'));c.bad.jobs[0].rate=8;assert.throws(()=>run(`saveLedger_({data:bad,revision:2,operationId:'bad'})`),/closed salary/i);
c.bad=structuredClone(run('data'));c.bad.salaryLocks=[];assert.throws(()=>run(`saveLedger_({data:bad,revision:2,operationId:'unlock-no-reason'})`),/Reopen/);
run(`data.salaryLocks=[];data.history.push({at:new Date().toISOString(),action:'Salary month reopened',details:'2026-11: Correction'});saveLedger_({data,revision:2,operationId:'reopen'})`);
run(`data.jobs[0].rate=4`);failCommit=true;assert.throws(()=>run(`saveLedger_({data,revision:3,operationId:'retry'})`),/network/);assert.equal(run('loadLedger_().revision'),3);failCommit=false;run(`saveLedger_({data,revision:3,operationId:'retry'})`);assert.equal(run('loadLedger_().data.jobs[0].rate'),4);
run(`data.master[0].style='=IMPORTXML("https://example.com","//a")';saveLedger_({data,revision:4,operationId:'literal'})`);assert.equal(tabs.Lots.rows[1][3],c.data.master[0].style);
for(let i=5;i<9;i++)run(`saveLedger_({data,revision:${i},operationId:'save${i}'})`);assert.equal(run('listLedgerBackups_().length'),5);

const crypto=require('crypto'),secret='test-bridge-secret-'.repeat(4);
c.PropertiesService={getScriptProperties:()=>({getProperty:()=>secret})};
c.Utilities.Charset={UTF_8:'UTF-8'};
c.Utilities.computeHmacSha256Signature=(message,key)=>[...crypto.createHmac('sha256',key).update(message).digest()];
c.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})};
function envelope(role,action,payload={},timestamp=Date.now(),email=role==='owner'?'mohdsaad.work3@gmail.com':'viewer@example.com'){const message=JSON.stringify({actor:{role,email},action,payload,timestamp});return {message,signature:crypto.createHmac('sha256',secret).update(message).digest('hex')}}
function call(e){c.event={postData:{contents:JSON.stringify(e)}};return run('doPost(event)')}
assert.equal(call(envelope('viewer','load')).ok,true);
assert.equal(call(envelope('viewer','save',{data:c.data,revision:9,operationId:'denied'})).status,403);
assert.equal(call(envelope('owner','save',{},Date.now(),'wrong@example.com')).status,403);
assert.equal(call({...envelope('owner','load'),signature:'0'.repeat(64)}).status,403);
assert.equal(call(envelope('owner','load',{},Date.now()-400000)).status,403);
assert.equal(call(envelope('owner','backups')).data.length,5);
assert.equal(locked,false);
console.log('PASS: Google bridge signatures, owner/viewer enforcement, expiration, atomic saves, conflicts, retries, backups, closed months and literal cells.');
