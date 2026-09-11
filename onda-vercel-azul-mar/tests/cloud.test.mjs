import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration,createCloud } from '../lib/cloud.mjs';
const config={configured:true,url:'https://unit-test.supabase.co',publicKey:'sb_publishable_test_only',secretKey:'sb_secret_test_only',missing:[]};
const response=(value,status=200)=>new Response(value===null?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('Missing env variables do not crash a preview build',()=>{
 assert.equal(configuration({}).configured,false);
 assert.equal(configuration({SUPABASE_URL:config.url}).missing.length,2);
});
test('Invalid URLs and a secret in the publishable-key slot are rejected',()=>{
 assert.throws(()=>configuration({SUPABASE_URL:'http://example.com',SUPABASE_PUBLISHABLE_KEY:'pub',SUPABASE_SECRET_KEY:'priv'}),e=>e.status===503);
 assert.throws(()=>configuration({SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:'sb_secret_wrong',SUPABASE_SECRET_KEY:'priv'}),e=>e.status===503);
});
test('Modern secret keys are only sent in apikey, never as a bearer JWT',async()=>{
 let seen;const c=createCloud(config,async(url,init)=>{seen={url,init};return response([{id:'polos'}]);});
 assert.equal(await c.categoryExists('polos'),true);assert.equal(seen.init.headers.apikey,config.secretKey);assert.equal(seen.init.headers.Authorization,undefined);assert.ok(seen.init.signal);
});
test('Legacy service_role keys retain the legacy Authorization header',async()=>{
 let seen;const c=createCloud({...config,secretKey:'legacy.jwt.key'},async(url,init)=>{seen=init;return response([]);});
 await c.categoryExists('none');assert.equal(seen.headers.Authorization,'Bearer legacy.jwt.key');
});
test('Product save calls the atomic RPC with a JSON body',async()=>{
 let seen;const input={id:'test-id',name:'Polo'};
 const c=createCloud(config,async(url,init)=>{seen={url,init};return response(input);});
 assert.deepEqual(await c.saveProduct(input),input);assert.match(seen.url,/\/rpc\/onda_save_product$/);assert.deepEqual(JSON.parse(seen.init.body),{_product:input});
});
test('Supabase constraint failures become safe conflict responses',async()=>{
 const c=createCloud(config,async()=>response({code:'23505',message:'sensitive detail that must not leak'},409));
 await assert.rejects(()=>c.createCategory('x','Polo'),e=>e.status===409&&!e.message.includes('sensitive'));
});
test('Rate limiter requires explicit true and fails closed',async()=>{
 const c=createCloud(config,async()=>response(false));await assert.rejects(()=>c.limit('test',10,900),e=>e.status===429);
});
test('Authentication uses public key, destroys Auth token, and returns only current user',async()=>{
 const calls=[];const user={id:'44444444-4444-4444-8444-444444444444',email:'test@example.test',updated_at:'2026-09-11T00:00:00Z',email_confirmed_at:'2026-09-10T00:00:00Z'};
 const c=createCloud(config,async(url,init)=>{
  calls.push({url,init});
  if(url.includes('/token?'))return response({user,access_token:'issued-token-never-returned'});
  if(url.includes('/logout?'))return response(null,204);
  return response(user);
 });
 const result=await c.signIn(user.email,'fixture-password');assert.deepEqual(result,user);assert.equal(result.access_token,undefined);assert.equal(calls[0].init.headers.apikey,config.publicKey);assert.equal(calls[1].init.headers.Authorization,'Bearer issued-token-never-returned');assert.equal(calls[2].init.headers.apikey,config.secretKey);
});
test('Credential or account changes invalidate application sessions',async()=>{
 const userId='44444444-4444-4444-8444-444444444444';let deleted=false;
 const c=createCloud(config,async(url,init)=>{
  if(init.method==='DELETE'){deleted=true;return response(null,204);}
  if(url.includes('/onda_sessions?'))return response([{token_hash:'a'.repeat(64),user_id:userId,auth_version:'2026-09-10T00:00:00Z'}]);
  if(url.includes('/onda_admins?'))return response([{user_id:userId}]);
  return response({id:userId,email_confirmed_at:'2026-01-01T00:00:00Z',updated_at:'2026-09-11T00:00:00Z'});
 });
 assert.equal(await c.session('a'.repeat(64)),null);assert.equal(deleted,true);
});
test('HTTP errors and network failures never return raw upstream secrets',async()=>{
 const c=createCloud(config,async()=>{throw new Error('secret-error-value');});
 await assert.rejects(()=>c.settings(),e=>e.status===502&&!e.message.includes('secret-error-value'));
});
