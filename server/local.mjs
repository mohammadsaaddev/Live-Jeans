import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHandler} from './handler.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const handler=createHandler();
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost:3000');if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers();Object.entries(req.headers).forEach(([k,v])=>headers.set(k,v));const r=await handler(new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}));res.statusCode=r.status;for(const [k,v]of r.headers)if(k!=='set-cookie')res.setHeader(k,v);if(r.headers.getSetCookie().length)res.setHeader('Set-Cookie',r.headers.getSetCookie());res.end(Buffer.from(await r.arrayBuffer()));return}const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return}const bytes=await fs.readFile(target);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(target)]||'application/octet-stream');res.end(bytes)}catch{res.writeHead(404).end('Not found')}}).listen(3000,'127.0.0.1',()=>console.log('Local preview: http://localhost:3000. No deployment performed.'));
