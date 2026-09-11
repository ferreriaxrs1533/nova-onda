import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler,validateImage } from '../lib/app.mjs';
import { memoryCloud,TEST_EMAIL,TEST_PASSWORD,PNG } from './helpers.mjs';
import { HttpError } from '../lib/security.mjs';

async function fixture(t,{configured=true,env={}}={}){
 const cloud=memoryCloud();
 const server=http.createServer(createHandler({cloud:configured?cloud:undefined,env}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base=`http://127.0.0.1:${server.address().port}`;let cookie='',csrf='';
 async function call(url,{method='GET',data,headers={},auth=true}={}){
  const res=await fetch(base+url,{method,headers:{Origin:base,...(data!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:res.status,headers:res.headers,data:await res.json()};
 }
 async function login(){const r=await call('/api/admin/login',{method:'POST',data:{email:TEST_EMAIL,password:TEST_PASSWORD}});cookie=r.headers.get('set-cookie')?.split(';')[0]||'';csrf=r.data.csrf||'';return r;}
 const product=(status='published')=>({name:'Polo teste',slug:'polo-teste',brand:'Ralph Lauren',category_id:'polos',price_cents:42900,compare_cents:null,status,featured:true,images:[cloud.seedImage()],variants:[{size:'M',color:'Azul',stock:3,sku:'POLO-M'}]});
 return {cloud,call,login,product,base};
}

test('Preview works without cloud credentials and never pretends admin is configured',async t=>{
 const f=await fixture(t,{configured:false});
 const h=await f.call('/api/health');assert.equal(h.status,200);assert.equal(h.data.configured,false);assert.equal(h.data.missing.length,3);
 const r=await f.call('/api/catalog');assert.equal(r.data.products.length,6);assert.ok(r.data.products.every(p=>p.is_demo));assert.equal(r.data.configured,false);
 const a=await f.call('/api/admin/login',{method:'POST',data:{email:TEST_EMAIL,password:TEST_PASSWORD}});assert.equal(a.status,503);
});
test('Vercel rewrite path reaches the API',async t=>{
 const f=await fixture(t,{configured:false});const r=await f.call('/api/index?route=catalog');assert.equal(r.status,200);assert.equal(r.data.products.length,6);
});
test('No credentials are exposed by health',async t=>{
 const f=await fixture(t);const r=await f.call('/api/health');assert.equal(r.status,200);assert.ok(!JSON.stringify(r.data).includes('secret'));assert.equal(r.headers.get('cache-control'),'no-store, private');
});
test('Unauthenticated visitors cannot read or write administrative data',async t=>{
 const f=await fixture(t);for(const [path,method]of[['/api/admin/products','GET'],['/api/admin/products','POST'],['/api/admin/upload','POST'],['/api/admin/diagnostics','GET']])assert.equal((await f.call(path,{method,data:method==='POST'?{}:undefined})).status,401);
});
test('Origin protection rejects cross-site writes',async t=>{
 const f=await fixture(t);const r=await f.call('/api/admin/login',{method:'POST',data:{email:TEST_EMAIL,password:TEST_PASSWORD},headers:{Origin:'https://evil.example'}});assert.equal(r.status,403);
});
test('Login sets an HttpOnly SameSite cookie, without returning its raw token',async t=>{
 const f=await fixture(t);const r=await f.login();assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.ok(r.data.csrf);assert.ok(!r.data.access_token);assert.equal((await f.call('/api/admin/session')).data.authenticated,true);
});
test('CSRF is required for admin mutations',async t=>{
 const f=await fixture(t);await f.login();const r=await f.call('/api/admin/products',{method:'POST',data:f.product(),headers:{'X-CSRF-Token':'wrong'}});assert.equal(r.status,403);
});
test('Invalid password fails and account-level rate limiting applies',async t=>{
 const f=await fixture(t);for(let i=0;i<10;i++)assert.equal((await f.call('/api/admin/login',{method:'POST',data:{email:TEST_EMAIL,password:'wrong'}})).status,401);
 assert.equal((await f.call('/api/admin/login',{method:'POST',data:{email:TEST_EMAIL,password:'wrong'}})).status,429);
});
test('Removing admin permission invalidates existing sessions',async t=>{
 const f=await fixture(t);await f.login();f.cloud.revoke();assert.equal((await f.call('/api/admin/products')).status,401);
});
test('Expired sessions are rejected',async t=>{
 const f=await fixture(t);await f.login();for(const s of f.cloud.sessions.values())s.expires_at='2000-01-01T00:00:00Z';assert.equal((await f.call('/api/admin/products')).status,401);
});
test('Logout revokes the session',async t=>{
 const f=await fixture(t);await f.login();assert.equal((await f.call('/api/admin/logout',{method:'POST'})).status,200);assert.equal((await f.call('/api/admin/products')).status,401);
});
test('Published product appears and replaces demo products',async t=>{
 const f=await fixture(t);await f.login();const r=await f.call('/api/admin/products',{method:'POST',data:f.product()});assert.equal(r.status,201);assert.equal(r.data.is_demo,false);
 const cat=await f.call('/api/catalog');assert.equal(cat.data.products.length,1);assert.equal(cat.data.products[0].name,'Polo teste');
});
test('Draft stays private and updates keep existing variant identities',async t=>{
 const f=await fixture(t);await f.login();const created=await f.call('/api/admin/products',{method:'POST',data:f.product('draft')});
 assert.ok((await f.call('/api/catalog')).data.products.every(p=>p.is_demo));
 const updated=await f.call(`/api/admin/products/${created.data.id}`,{method:'PUT',data:{...created.data,status:'published',name:'Polo editada'}});
 assert.equal(updated.status,200);assert.equal(updated.data.variants[0].id,created.data.variants[0].id);
});
test('Bad publication data cannot be saved',async t=>{
 const f=await fixture(t);await f.login();
 for(const patch of[{images:[]},{variants:[]},{price_cents:0},{category_id:'missing'},{price_cents:-1},{compare_cents:1}]){
  const r=await f.call('/api/admin/products',{method:'POST',data:{...f.product(),...patch}});assert.equal(r.status,400);
 }
 assert.equal(f.cloud.products.size,0);
});
test('External image URLs are rejected for real products',async t=>{
 const f=await fixture(t);await f.login();const r=await f.call('/api/admin/products',{method:'POST',data:{...f.product(),images:['https://evil.example/file.svg']}});assert.equal(r.status,400);
});
test('Negative stock, repeated size/color, and repeated SKU are rejected',async t=>{
 const f=await fixture(t);await f.login();const original=f.product();
 for(const variants of[[{size:'M',color:'Azul',stock:-1}], [{size:'M',color:'Azul',stock:1},{size:'M',color:'Azul',stock:1}], [{size:'M',color:'Azul',stock:1,sku:'X'},{size:'G',color:'Azul',stock:1,sku:'X'}]])assert.equal((await f.call('/api/admin/products',{method:'POST',data:{...original,variants}})).status,400);
});
test('Duplicate becomes draft with distinct slug and SKUs and no phantom stock',async t=>{
 const f=await fixture(t);await f.login();const p=(await f.call('/api/admin/products',{method:'POST',data:f.product()})).data;
 const copy=await f.call(`/api/admin/products/${p.id}/duplicate`,{method:'POST'});assert.equal(copy.status,201);assert.equal(copy.data.status,'draft');assert.equal(copy.data.variants[0].stock,0);assert.notEqual(copy.data.slug,p.slug);assert.notEqual(copy.data.variants[0].sku,p.variants[0].sku);
});
test('Archive removes visibility; delete removes the record',async t=>{
 const f=await fixture(t);await f.login();const p=(await f.call('/api/admin/products',{method:'POST',data:f.product()})).data;
 assert.equal((await f.call(`/api/admin/products/${p.id}/archive`,{method:'POST'})).data.status,'archived');assert.ok((await f.call('/api/catalog')).data.products.every(p=>p.is_demo));
 assert.equal((await f.call(`/api/admin/products/${p.id}`,{method:'DELETE'})).status,200);assert.equal((await f.call('/api/admin/products')).data.length,0);
});
test('Upload enforces image type and registers cloud URLs',async t=>{
 const f=await fixture(t);await f.login();const good=await f.call('/api/admin/upload',{method:'POST',data:{type:'image/png',data:PNG.toString('base64')}});assert.equal(good.status,201);assert.match(good.data.url,/supabase\.co\/storage\/v1\/object\/public\/onda-products\//);
 assert.equal((await f.call('/api/admin/upload',{method:'POST',data:{type:'image/svg+xml',data:Buffer.from('<svg></svg>').toString('base64')}})).status,400);
 assert.equal((await f.call('/api/admin/upload',{method:'POST',data:{type:'image/jpeg',data:PNG.toString('base64')}})).status,400);
});
test('Upload rejects oversized files before storage',()=>{
 assert.throws(()=>validateImage({type:'image/png',data:Buffer.alloc(3*1024*1024+1).toString('base64')}),e=>e.status===413);
});
test('Settings validate WhatsApp and ignore non-settings fields',async t=>{
 const f=await fixture(t);await f.login();assert.equal((await f.call('/api/admin/settings',{method:'PUT',data:{mode:'whatsapp',whatsapp:''}})).status,400);
 const r=await f.call('/api/admin/settings',{method:'PUT',data:{name:'ONDA Azul',mode:'whatsapp',whatsapp:'5511999999999',service_role:'not-allowed'}});assert.equal(r.status,200);assert.ok(!Object.hasOwn(r.data,'service_role'));assert.equal((await f.call('/api/catalog')).data.settings.name,'ONDA Azul');
});
test('Bag validates server price and never accepts a fake client price',async t=>{
 const f=await fixture(t);await f.login();const p=(await f.call('/api/admin/products',{method:'POST',data:f.product()})).data;
 const r=await f.call('/api/bag/validate',{method:'POST',data:{items:[{variant_id:p.variants[0].id,quantity:2,unit_cents:1}],total_cents:2}});assert.equal(r.status,200);assert.equal(r.data.total_cents,85800);assert.equal(r.data.checkout_enabled,false);assert.equal(r.data.whatsapp_url,null);
});
test('Bag aggregates duplicate variants and rejects stock overrun',async t=>{
 const f=await fixture(t);await f.login();const p=(await f.call('/api/admin/products',{method:'POST',data:f.product()})).data;
 const items=[{variant_id:p.variants[0].id,quantity:2},{variant_id:p.variants[0].id,quantity:2}];assert.equal((await f.call('/api/bag/validate',{method:'POST',data:{items}})).status,400);
});
test('Demo items cannot be requested',async t=>{
 const f=await fixture(t);const r=await f.call('/api/bag/validate',{method:'POST',data:{items:[{variant_id:'demo-polo-pima-m',quantity:1}]}});assert.equal(r.status,400);
});
test('WhatsApp produces a request, not a payment, and does not decrement stock',async t=>{
 const f=await fixture(t);await f.login();const p=(await f.call('/api/admin/products',{method:'POST',data:f.product()})).data;
 await f.call('/api/admin/settings',{method:'PUT',data:{mode:'whatsapp',whatsapp:'5511999999999'}});
 const r=await f.call('/api/bag/validate',{method:'POST',data:{items:[{variant_id:p.variants[0].id,quantity:1}]}});assert.equal(r.data.checkout_enabled,true);assert.match(r.data.whatsapp_url,/^https:\/\/wa\.me\//);assert.equal((await f.cloud.getProduct(p.id)).variants[0].stock,3);
});
test('Cloud errors are not disguised as a working demo catalog',async t=>{
 const f=await fixture(t);f.cloud.catalog=async()=>{throw new HttpError(502,'Banco indisponivel.');};const r=await f.call('/api/catalog');assert.equal(r.status,502);assert.equal(r.data.products,undefined);
});
test('Category creation and diagnostics require administrator permission',async t=>{
 const f=await fixture(t);assert.equal((await f.call('/api/admin/categories',{method:'POST',data:{name:'Jaquetas'}})).status,401);await f.login();assert.equal((await f.call('/api/admin/categories',{method:'POST',data:{name:'Jaquetas'}})).status,201);assert.equal((await f.call('/api/admin/diagnostics')).data.storage,true);
});
