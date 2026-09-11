// Test-only double. Never imported by api/, lib/ or public/.
import { randomUUID } from 'node:crypto';
import { defaults,categories } from '../lib/content.mjs';
import { HttpError } from '../lib/security.mjs';
export const OWNER='44444444-4444-4444-8444-444444444444';
export const TEST_EMAIL='owner@example.test';
export const TEST_PASSWORD='test-only-not-a-production-password';
export const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN7sAAAAASUVORK5CYII=','base64');
export function memoryCloud(){
 const products=new Map(),sessions=new Map(),assets=new Set(),limits=new Map();
 const cats=structuredClone(categories);let settings={...defaults};let authorized=true;
 return {
  config:{configured:true,missing:[],url:'https://test-project.supabase.co'},products,sessions,assets,
  revoke(){authorized=false;},
  publicImageUrl:name=>`https://test-project.supabase.co/storage/v1/object/public/onda-products/${name}`,
  async catalog(){return {products:structuredClone([...products.values()].filter(p=>p.status==='published')),categories:structuredClone(cats),settings:{...settings},configured:true};},
  async listProducts(){return structuredClone([...products.values()]);},
  async getProduct(id){return structuredClone(products.get(id)||null);},
  async categoryExists(id){return cats.some(c=>c.id===id);},
  async saveProduct(p){
    for(const other of products.values())if(other.id!==p.id){
      if(other.slug===p.slug||other.variants.some(v=>p.variants.some(x=>x.sku===v.sku)))throw new HttpError(409,'Duplicado.');
    }
    const result={...structuredClone(p),created_at:products.get(p.id)?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
    result.variants=result.variants.map(v=>({...v,product_id:p.id}));products.set(p.id,result);return structuredClone(result);
  },
  async deleteProduct(id){products.delete(id);},
  async archiveProduct(id){products.get(id).status='archived';return this.getProduct(id);},
  async createCategory(id,name){if(cats.some(c=>c.name===name))throw new HttpError(409,'Duplicado.');const c={id,name};cats.push(c);return c;},
  async settings(){return {...settings};},
  async saveSettings(next){settings={...next};return settings;},
  async variant(id){for(const p of products.values()){const v=p.variants.find(v=>v.id===id);if(v)return {...v,product:p};}return null;},
  async imageExists(name){return assets.has(name);},
  async upload(name,bytes,mime,userId){assets.add(name);return this.publicImageUrl(name);},
  async limit(key,max,seconds){limits.set(key,(limits.get(key)||0)+1);if(limits.get(key)>max)throw new HttpError(429,'Muitas tentativas.');},
  async signIn(email,password){if(email!==TEST_EMAIL||password!==TEST_PASSWORD)throw new HttpError(401,'Credenciais invalidas.');return {id:OWNER,email:TEST_EMAIL,email_confirmed_at:'2026-01-01T00:00:00Z',updated_at:'2026-09-11T00:00:00Z'};},
  async isAdmin(id){return authorized&&id===OWNER;},
  async session(h){const s=sessions.get(h);return authorized&&s&&new Date(s.expires_at)>new Date()?s:null;},
  async createSession(s){sessions.set(s.token_hash,s);},
  async deleteSession(h){sessions.delete(h);},
  async diagnostics(){return {database:true,storage:true,adminConfigured:authorized};},
  seedImage(){const name=`${randomUUID()}.png`;assets.add(name);return this.publicImageUrl(name);}
 };
}
