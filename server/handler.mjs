import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const mac=(text,key)=>createHmac('sha256',key).update(text).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function seal(value,key){const text=Buffer.from(JSON.stringify(value)).toString('base64url');return text+'.'+mac(text,key)}
export function unseal(text,key){try{const [data,sig,...extra]=text.split('.');if(extra.length||!equal(sig,mac(data,key)))return null;const p=JSON.parse(Buffer.from(data,'base64url'));return Number.isFinite(p.exp)&&p.exp>Date.now()?p:null}catch{return null}}
export function roleFor(email,env){const s=String(email).toLowerCase();if(s===env.OWNER_EMAIL?.trim().toLowerCase())return 'owner';return (env.VIEWER_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(s)?'viewer':null}
async function googleVerify(token,audience){const {OAuth2Client}=await import('google-auth-library');return (await new OAuth2Client().verifyIdToken({idToken:token,audience})).getPayload()}
function settings(env){for(const k of ['APP_ORIGIN','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','OWNER_EMAIL','SESSION_SECRET','BRIDGE_SECRET','SHEETS_BRIDGE_URL'])if(!env[k])throw Error('Setup incomplete');if(env.SESSION_SECRET.length<32||env.BRIDGE_SECRET.length<32||env.SESSION_SECRET===env.BRIDGE_SECRET)throw Error('Setup incomplete');const origin=new URL(env.APP_ORIGIN);if(origin.origin!==env.APP_ORIGIN||origin.protocol!=='https:'&&!(env.ALLOW_LOCAL_HTTP==='true'&&origin.hostname==='localhost'))throw Error('Invalid origin');if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.SHEETS_BRIDGE_URL))throw Error('Invalid bridge URL');return origin}
export function createHandler({env=process.env,fetcher=fetch,verifyToken=googleVerify}={}){return async request=>{
 let origin;try{origin=settings(env)}catch{return json({error:'Connection setup is not finished. The owner must configure Google login and Sheets access.'},503)}
 const secure=origin.protocol==='https:',cookieName=secure?'__Host-denim-session':'denim-local-session',flowName=secure?'__Host-denim-login':'denim-local-login';
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
 const cookies=Object.fromEntries((request.headers.get('cookie')||'').split(';').map(s=>s.trim().split(/=(.*)/s)).filter(a=>a[0]).map(a=>[a[0],a[1]||'']));
 const redirect=(url,cookies=[])=>{const h=new Headers({'Location':url,'Cache-Control':'no-store'});cookies.forEach(c=>h.append('Set-Cookie',c));return new Response(null,{status:303,headers:h})};
 const url=new URL(request.url),path=url.pathname;
 try{
 if(path==='/api/login'&&request.method==='GET'){
  const state=randomBytes(24).toString('hex'),nonce=randomBytes(24).toString('hex'),verifier=randomBytes(32).toString('base64url');
  const {createHash}=await import('node:crypto');const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.APP_ORIGIN+'/api/callback',response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).forEach(([k,v])=>u.searchParams.set(k,v));
  return redirect(u.href,[cookie(flowName,seal({state,nonce,verifier,exp:Date.now()+600000},env.SESSION_SECRET),600)]);
 }
 if(path==='/api/callback'&&request.method==='GET'){
  const flow=unseal(cookies[flowName]||'',env.SESSION_SECRET);if(!flow||!equal(url.searchParams.get('state'),flow.state)||!url.searchParams.get('code'))return json({error:'Login expired or invalid. Start sign-in again.'},400);
  const tokenResponse=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:url.searchParams.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:env.APP_ORIGIN+'/api/callback',grant_type:'authorization_code',code_verifier:flow.verifier}),signal:AbortSignal.timeout(15000)});
  if(!tokenResponse.ok)return json({error:'Google sign-in failed. Try again.'},401);const tokens=await tokenResponse.json();const identity=await verifyToken(tokens.id_token,env.GOOGLE_CLIENT_ID);
  if(!identity?.email_verified||!identity.sub||!equal(identity.nonce,flow.nonce)||!roleFor(identity.email,env))return json({error:'This Google account has not been given access. Ask the owner to add it.'},403);
  return redirect(env.APP_ORIGIN+'/',[cookie(flowName,'',0),cookie(cookieName,seal({sub:identity.sub,email:identity.email.toLowerCase(),exp:Date.now()+8*3600000},env.SESSION_SECRET),8*3600)]);
 }
 const session=unseal(cookies[cookieName]||'',env.SESSION_SECRET),role=session&&roleFor(session.email,env);if(!role)return json({error:'Please sign in with an approved Google account.'},401);
 if(path==='/api/session'&&request.method==='GET')return json({email:session.email,role});
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==origin.origin)return json({error:'Request origin is not allowed.'},403);
 if(path==='/api/logout'&&request.method==='POST')return redirect(env.APP_ORIGIN+'/',[cookie(cookieName,'',0)]);
 let action,payload={};
 if(path==='/api/state'&&request.method==='GET')action='load';
 else if(path==='/api/state'&&request.method==='PUT'){
  if(role!=='owner')return json({error:'Only the owner can change records.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
  const body=await request.text();if(Buffer.byteLength(body)>2000000)return json({error:'Backup is too large. Download your records and ask for a storage upgrade.'},413);try{payload=JSON.parse(body)}catch{return json({error:'Invalid JSON.'},400)}
  if(!payload||!Number.isSafeInteger(payload.revision)||payload.revision<0||!/^[-\w]{1,100}$/.test(payload.operationId||'')||!payload.data)return json({error:'Invalid save request.'},400);action='save';
 }else if(path==='/api/backups'&&request.method==='GET'&&role==='owner')action='backups';
 else if(path==='/api/backup'&&request.method==='GET'&&role==='owner'){action='backup';payload={revision:Number(url.searchParams.get('revision'))};if(!Number.isSafeInteger(payload.revision)||payload.revision<1)return json({error:'Invalid backup.'},400)}
 else return json({error:'Not found or not permitted.'},404);
 const message=JSON.stringify({action,payload,actor:{email:session.email,role},timestamp:Date.now(),requestId:randomBytes(16).toString('hex')});
 const response=await fetcher(env.SHEETS_BRIDGE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,signature:mac(message,env.BRIDGE_SECRET)}),signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('Bridge unavailable');const result=await response.json();if(!result.ok){const code=[400,403,409,503].includes(result.status)?result.status:503;return json({error:result.error||'Google Sheets could not complete the request.'},code)}return json(result.data);
 }catch{return json({error:'The Google connection could not complete this request. Your pending changes have not been discarded; retry shortly.'},503)}
}}
