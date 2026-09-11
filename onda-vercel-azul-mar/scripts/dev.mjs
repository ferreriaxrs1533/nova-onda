/** Local runner only. Vercel uses api/index.js directly. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import api from '../api/index.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));
const publicDir=path.join(root,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const files=new Set(['styles.css','app.js','admin.js','shared.js','favicon.svg','placeholder.svg','editorial.svg','camisa.svg','trico.svg','calca.svg','robots.txt']);
const server=http.createServer(async(req,res)=>{
  for(const h of config.headers[0].headers) res.setHeader(h.key,h.value);
  if(req.url.startsWith('/api/')) return api(req,res);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
    const pathname=new URL(req.url,'http://local').pathname;
    const basename=pathname.slice(1);
    const file=files.has(basename)?basename:(pathname==='/admin'||pathname.startsWith('/admin/'))?'admin.html':'index.html';
    const bytes=await readFile(path.join(publicDir,file));
    res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(500);res.end('Nao foi possivel carregar.');}
});
const port=Number(process.env.PORT||3000);
server.listen(port,'127.0.0.1',()=>console.log(`ONDA: http://localhost:${port}\nPainel: http://localhost:${port}/admin`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
