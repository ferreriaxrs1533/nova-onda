import { randomUUID } from 'node:crypto';
import { HttpError, ensure, text, integer, token, hash } from './security.mjs';
import { configuration, createCloud, MAX_IMAGE_BYTES } from './cloud.mjs';
import { defaults, demos, demoCatalog } from './content.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SESSION_SECONDS = 8 * 60 * 60;
export function json(res, status, data) {
  const result = JSON.stringify(data);
  ensure(Buffer.byteLength(result) < 4300000, 'Catalogo muito grande. E necessario ajustar a paginacao.', 503);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' });
  res.end(result);
}
export async function readBody(req, max = 1024 * 1024) {
  ensure((req.headers['content-type'] || '').split(';')[0].trim() === 'application/json', 'Envie JSON.', 415);
  if (req.headers['content-length']) ensure(Number(req.headers['content-length']) <= max, 'Requisicao muito grande.', 413);
  let raw;
  if (req.body !== undefined) {
    raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
  } else {
    let size = 0; const chunks = [];
    for await (const part of req) {
      const buf = Buffer.from(part); size += buf.length;
      ensure(size <= max, 'Requisicao muito grande.', 413); chunks.push(buf);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  ensure(Buffer.byteLength(raw || '') <= max, 'Requisicao muito grande.', 413);
  try {
    const value = JSON.parse(raw);
    ensure(value && typeof value === 'object' && !Array.isArray(value), 'JSON invalido.');
    return value;
  } catch (error) { if (error.status) throw error; throw new HttpError(400, 'JSON invalido.'); }
}
function sessionToken(req) {
  const part = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('onda_session='));
  const raw = part?.slice('onda_session='.length);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
}
function secureCookies(env) { return env.VERCEL === '1' || env.NODE_ENV === 'production'; }
function setCookie(res, value, seconds, env) {
  res.setHeader('Set-Cookie', `onda_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${secureCookies(env) ? '; Secure' : ''}`);
}
function requireOrigin(req, env) {
  // Compare with the actual request host. Never trust an arbitrary Origin as configuration.
  const scheme = secureCookies(env) ? 'https' : 'http';
  const host = req.headers.host;
  ensure(typeof host === 'string' && /^[a-zA-Z0-9.:[\]-]+$/.test(host), 'Host invalido.', 403);
  ensure(req.headers.origin === `${scheme}://${host}`, 'Origem nao autorizada. Abra o painel pelo mesmo endereco da loja.', 403);
}
function ipKey(req, env) {
  const forwarded = env.VERCEL === '1' ? (req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for']) : null;
  return hash(String(forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim());
}
function routeOf(req) {
  const u = new URL(req.url || '/', 'http://local');
  if (u.pathname === '/api/index' || u.pathname === '/api/index.js') {
    const tail = u.searchParams.get('route') || '';
    ensure(/^[a-zA-Z0-9_/-]*$/.test(tail), 'Rota invalida.', 404);
    return `/api/${tail}`.replace(/\/+$/, '');
  }
  return u.pathname.replace(/\/+$/, '');
}
export function validateImage(input) {
  ensure(['image/jpeg', 'image/png', 'image/webp'].includes(input.type), 'Use JPG, PNG ou WebP.');
  ensure(typeof input.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(input.data), 'Arquivo invalido.');
  const bytes = Buffer.from(input.data, 'base64');
  ensure(bytes.length > 12 && bytes.length <= MAX_IMAGE_BYTES, 'Cada foto deve ter ate 3 MB.', 413);
  let ext = '';
  if (bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) ext = 'jpg';
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext = 'png';
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') ext = 'webp';
  ensure(ext && { jpg:'image/jpeg', png:'image/png', webp:'image/webp' }[ext] === input.type, 'O arquivo nao corresponde a uma imagem aceita.');
  return { bytes, ext, mime:input.type };
}
export async function validateProduct(input, id, cloud, old = null) {
  const name = text(input.name, 160); ensure(name.length >= 2, 'Informe o nome da peca.');
  const slug = text(input.slug || name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''), 180);
  ensure(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 'Endereco do produto invalido.');
  const category_id = text(input.category_id, 100);
  ensure(await cloud.categoryExists(category_id), 'Selecione uma categoria valida.');
  const price_cents = integer(input.price_cents);
  const compare_cents = input.compare_cents == null ? null : integer(input.compare_cents);
  ensure(compare_cents == null || compare_cents >= price_cents, 'O preco anterior deve ser maior ou igual ao atual.');
  ensure(['draft','published','archived'].includes(input.status), 'Status invalido.');
  ensure(Array.isArray(input.images) && input.images.length <= 12, 'Use no maximo 12 fotos.');
  const images = [];
  const prefix = cloud.publicImageUrl('');
  for (const image of input.images) {
    ensure(typeof image === 'string' && image.startsWith(prefix), 'Envie as fotos pelo botao de upload.');
    const name = image.slice(prefix.length);
    ensure(/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name) && await cloud.imageExists(name), 'Foto nao encontrada. Envie novamente.');
    images.push(image);
  }
  ensure(new Set(images).size === images.length, 'Nao repita a mesma foto.');
  ensure(Array.isArray(input.variants) && input.variants.length <= 100, 'Variacoes invalidas.');
  const oldIds = new Set((old?.variants || []).map(v => v.id));
  const variants = input.variants.map(v => ({
    id: oldIds.has(v.id) ? v.id : randomUUID(),
    sku: text(v.sku || `${id}-${token().slice(0,8)}`, 100),
    size: text(v.size, 30), color: text(v.color, 60), stock: integer(v.stock, 100000)
  }));
  ensure(variants.every(v => v.size && v.color && v.sku), 'Preencha tamanho, cor e SKU das variacoes.');
  ensure(new Set(variants.map(v => `${v.size}\u0000${v.color}`)).size === variants.length, 'Nao repita tamanho e cor.');
  ensure(new Set(variants.map(v => v.id)).size === variants.length, 'Variacao duplicada.');
  ensure(new Set(variants.map(v => v.sku)).size === variants.length, 'Nao repita o SKU.');
  if (input.status === 'published') {
    ensure(price_cents > 0, 'Informe um preco maior que zero.');
    ensure(images.length && variants.length, 'Adicione pelo menos uma foto e uma variacao.');
  }
  return { id, slug, name, category_id, price_cents, compare_cents, status:input.status,
    featured:Boolean(input.featured), is_demo:false, brand:text(input.brand || 'Ralph Lauren',100),
    description:text(input.description || ''), composition:text(input.composition || '',2000),
    measurements:text(input.measurements || '',2000), images, variants };
}
function validateSettings(data, current) {
  const next = { ...defaults, ...current };
  for (const key of Object.keys(defaults)) if (Object.hasOwn(data,key)) next[key] = text(data[key], ['about','returns','shipping'].includes(key) ? 5000 : 1000);
  ensure(next.name.length >= 2 && next.name.length <= 40, 'Nome da loja deve ter de 2 a 40 caracteres.');
  ensure(['preparation','whatsapp'].includes(next.mode), 'Modo invalido.');
  next.whatsapp = next.whatsapp.replace(/\D/g,'');
  ensure(!next.whatsapp || /^[1-9]\d{9,14}$/.test(next.whatsapp), 'Informe WhatsApp com codigo do pais e DDD.');
  ensure(next.mode !== 'whatsapp' || next.whatsapp, 'Cadastre o WhatsApp antes de ativar pedidos.');
  ensure(!next.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email), 'E-mail invalido.');
  ensure(!next.instagram || /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._/]+$/.test(next.instagram), 'Use uma URL https://instagram.com/usuario.');
  return next;
}
export function createHandler({ cloud: injectedCloud, env = process.env } = {}) {
  return async function handler(req,res) {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    try {
      const route = routeOf(req), method = req.method || 'GET';
      if (['POST','PUT','PATCH','DELETE'].includes(method)) requireOrigin(req,env);
      const config = injectedCloud?.config || configuration(env);
      if (route === '/api/health' && method === 'GET') return json(res,200,{ok:true,configured:config.configured,missing:config.missing,version:'2.0.0'});
      if (!config.configured) {
        if (route === '/api/catalog' && method === 'GET') return json(res,200,demoCatalog(false));
        if (route === '/api/admin/session' && method === 'GET') return json(res,200,{authenticated:false,configured:false});
        throw new HttpError(503,'Ative o banco e as fotos seguindo COMECE-AQUI.md. As tres variaveis do Supabase ainda nao foram configuradas.');
      }
      const cloud = injectedCloud || createCloud(config);
      async function getSession() { const raw = sessionToken(req); return raw ? cloud.session(hash(raw)) : null; }
      async function admin(write=false) {
        const s = await getSession(); ensure(s, 'Entre com sua conta de administrador.',401);
        if (write) ensure(req.headers['x-csrf-token'] === s.csrf, 'Sessao invalida. Atualize a pagina.',403);
        return s;
      }
      if (route === '/api/catalog' && method === 'GET') {
        const result = await cloud.catalog();
        result.products = result.products.filter(p => p.status === 'published' && !p.is_demo);
        if (!result.products.length) result.products = structuredClone(demos);
        result.settings = { ...defaults, ...result.settings };
        return json(res,200,result);
      }
      if (route === '/api/admin/session' && method === 'GET') {
        const s = await getSession();
        return json(res,200,s ? {authenticated:true,email:s.email,csrf:s.csrf,configured:true} : {authenticated:false,configured:true});
      }
      if (route === '/api/admin/login' && method === 'POST') {
        const input = await readBody(req,4096);
        const email = text(input.email,254).toLowerCase();
        ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'E-mail invalido.');
        ensure(typeof input.password === 'string' && input.password.length >= 1 && input.password.length <= 128, 'Senha invalida.');
        await cloud.limit(`login-ip:${ipKey(req,env)}`,25,900);
        await cloud.limit(`login-account:${hash(email)}`,10,900);
        const user = await cloud.signIn(email,input.password);
        ensure(UUID.test(user.id) && user.email_confirmed_at && await cloud.isAdmin(user.id), 'Esta conta nao tem acesso administrativo. Autorize-a com setup/02-ADMIN.sql.',403);
        const raw = token(), csrf = token();
        const old = sessionToken(req); if (old) await cloud.deleteSession(hash(old));
        await cloud.createSession({token_hash:hash(raw),user_id:user.id,email:user.email || email,csrf,auth_version:user.updated_at,expires_at:new Date(Date.now()+SESSION_SECONDS*1000).toISOString()});
        setCookie(res,raw,SESSION_SECONDS,env);
        return json(res,200,{authenticated:true,email:user.email || email,csrf});
      }
      if (route === '/api/admin/logout' && method === 'POST') {
        const s = await admin(true); await cloud.deleteSession(s.token_hash); setCookie(res,'',0,env); return json(res,200,{ok:true});
      }
      if (route === '/api/admin/diagnostics' && method === 'GET') { await admin(); return json(res,200,await cloud.diagnostics()); }
      if (route === '/api/admin/products' && method === 'GET') { await admin(); return json(res,200,(await cloud.listProducts()).filter(p => !p.is_demo)); }
      if (route === '/api/admin/products' && method === 'POST') {
        await admin(true); const p = await validateProduct(await readBody(req),randomUUID(),cloud); return json(res,201,await cloud.saveProduct(p));
      }
      const match = route.match(/^\/api\/admin\/products\/([a-f0-9-]+)(?:\/(duplicate|archive))?$/);
      if (match) {
        await admin(method !== 'GET'); ensure(UUID.test(match[1]), 'Produto nao encontrado.',404);
        const old = await cloud.getProduct(match[1]); ensure(old && !old.is_demo, 'Produto nao encontrado.',404);
        if (method === 'GET' && !match[2]) return json(res,200,old);
        if (method === 'PUT' && !match[2]) return json(res,200,await cloud.saveProduct(await validateProduct(await readBody(req),old.id,cloud,old)));
        if (method === 'POST' && match[2] === 'archive') return json(res,200,await cloud.archiveProduct(old.id));
        if (method === 'POST' && match[2] === 'duplicate') {
          const id = randomUUID();
          const input = {...old,id,slug:`${old.slug.slice(0,130)}-${id.slice(0,8)}`,name:`${old.name.slice(0,150)} (copia)`,status:'draft',featured:false,
            variants:old.variants.map(v => ({...v,id:randomUUID(),sku:`${id}-${token().slice(0,8)}`,stock:0}))};
          return json(res,201,await cloud.saveProduct(await validateProduct(input,id,cloud)));
        }
        if (method === 'DELETE' && !match[2]) { await cloud.deleteProduct(old.id); return json(res,200,{ok:true}); }
        throw new HttpError(405,'Metodo nao permitido.');
      }
      if (route === '/api/admin/upload' && method === 'POST') {
        const s = await admin(true); await cloud.limit(`upload:${s.user_id}`,90,3600);
        const {bytes,ext,mime} = validateImage(await readBody(req,MAX_IMAGE_BYTES*4/3+8192));
        const url = await cloud.upload(`${randomUUID()}.${ext}`,bytes,mime,s.user_id);
        return json(res,201,{url});
      }
      if (route === '/api/admin/categories' && method === 'POST') {
        await admin(true); const input = await readBody(req,4096), name = text(input.name,60);
        ensure(name.length >= 2, 'Informe o nome da categoria.'); return json(res,201,await cloud.createCategory(randomUUID(),name));
      }
      if (route === '/api/admin/settings' && method === 'PUT') {
        await admin(true); const next = validateSettings(await readBody(req,32000),await cloud.settings());
        return json(res,200,await cloud.saveSettings(next));
      }
      if (route === '/api/bag/validate' && method === 'POST') {
        await cloud.limit(`bag:${ipKey(req,env)}`,60,60);
        const input = await readBody(req,32000);
        ensure(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 30, 'Sua sacola deve conter de 1 a 30 itens.');
        const combined = new Map();
        for (const item of input.items) {
          const id = text(item.variant_id,100); ensure(UUID.test(id), 'Produto ilustrativo ou variacao invalida.');
          integer(item.quantity,100); ensure(item.quantity > 0, 'Quantidade invalida.');
          combined.set(id,(combined.get(id) || 0)+item.quantity);
        }
        const items = await Promise.all([...combined].map(async ([id,quantity]) => {
          const v = await cloud.variant(id);
          ensure(v && v.product?.status === 'published' && !v.product.is_demo, 'Uma peca nao esta mais disponivel. Atualize a sacola.');
          ensure(quantity <= 100 && quantity <= v.stock, 'Estoque insuficiente para uma das pecas.');
          return {variant_id:id,name:v.product.name,size:v.size,color:v.color,quantity,unit_cents:v.product.price_cents,subtotal_cents:v.product.price_cents*quantity};
        }));
        const total_cents = items.reduce((sum,i) => sum+i.subtotal_cents,0), settings = await cloud.settings();
        const enabled = settings.mode === 'whatsapp' && /^[1-9]\d{9,14}$/.test(settings.whatsapp || '');
        const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
        const message = `Ola! Gostaria de solicitar estas pecas na ${settings.name}:\n\n${items.map(i => `${i.quantity}x ${i.name} | ${i.size} | ${i.color} | ${money(i.subtotal_cents)}`).join('\n')}\n\nSubtotal: ${money(total_cents)}\nSujeito a confirmacao de estoque, frete e pagamento. Esta mensagem nao reserva produtos.`;
        return json(res,200,{items,total_cents,checkout_enabled:enabled,whatsapp_url:enabled ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(message)}` : null});
      }
      throw new HttpError(404,'Recurso nao encontrado.');
    } catch (error) {
      if (!error.status) console.error('ONDA internal error:',error.name);
      if (!res.headersSent) return json(res,error.status || 500,{error:error.status ? error.message : 'Nao foi possivel concluir. Tente novamente.'});
      res.end();
    }
  };
}
