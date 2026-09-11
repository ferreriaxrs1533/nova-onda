/** Supabase HTTP adapter. Server-only. Uses native fetch; no browser SDK or secrets. */
import { HttpError, ensure } from './security.mjs';

export const BUCKET = 'onda-products';
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];
export function configuration(env = process.env) {
  const missing = REQUIRED_ENV.filter(key => !env[key]?.trim());
  if (missing.length) return { configured: false, missing };
  const url = env.SUPABASE_URL.trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(url); } catch { throw new HttpError(503, 'SUPABASE_URL invalida. Confira as variaveis na Vercel.'); }
  ensure(parsed.protocol === 'https:' && parsed.pathname === '/' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash,
    'SUPABASE_URL deve ser a URL HTTPS do projeto, sem /rest/v1 ou outros caminhos.', 503);
  const publicKey = env.SUPABASE_PUBLISHABLE_KEY.trim();
  const secretKey = env.SUPABASE_SECRET_KEY.trim();
  ensure(publicKey !== secretKey && !publicKey.startsWith('sb_secret_'), 'Use chaves diferentes: publishable e secret.', 503);
  return { configured: true, missing: [], url, publicKey, secretKey };
}
function checked(data, status) {
  if (status >= 200 && status < 300) return data;
  const code = String(data?.code || data?.error_code || '');
  if (code === '23505') throw new HttpError(409, 'Nome, endereco ou SKU ja cadastrado. Use outro valor.');
  if (['23503', '23514', '23502', '22P02', '22023'].includes(code)) throw new HttpError(400, 'Dados invalidos. Confira categoria, estoque, variacoes e fotos.');
  if (status === 429) throw new HttpError(429, 'Muitas tentativas. Aguarde e tente novamente.');
  if (code === '42P01' || code.startsWith('PGRST2')) throw new HttpError(503, 'Banco ainda nao instalado ou desatualizado. Execute setup/01-BANCO.sql no Supabase.');
  if (status === 401 || status === 403) throw new HttpError(503, 'Nao foi possivel conectar ao Supabase. Confira as chaves do projeto na Vercel.');
  console.error('Supabase operation failed:', status, code || 'no-code');
  throw new HttpError(502, 'O servico de dados nao respondeu como esperado. Tente novamente.');
}

export function createCloud(config, fetcher = fetch) {
  ensure(config.configured, 'Configure as tres variaveis do Supabase na Vercel para ativar o painel.', 503);
  const { url, publicKey, secretKey } = config;
  async function request(endpoint, { method = 'GET', data, bytes, mime, key = secretKey, bearer, headers = {}, rawError = false } = {}) {
    const h = { apikey: key, ...headers };
    // The new sb_* keys belong only in apikey, not in a JWT Authorization header.
    if (bearer) h.Authorization = `Bearer ${bearer}`;
    else if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
    let body;
    if (bytes) { h['Content-Type'] = mime; body = bytes; }
    else if (data !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(data); }
    let res;
    try { res = await fetcher(`${url}${endpoint}`, { method, headers: h, body, signal: AbortSignal.timeout(12000), redirect: 'error' }); }
    catch { throw new HttpError(502, 'Conexao com o Supabase indisponivel. Tente novamente.'); }
    const txt = await res.text();
    let value = null;
    try { value = txt ? JSON.parse(txt) : null; } catch { /* never expose raw upstream content */ }
    if (rawError) return { status: res.status, value };
    return checked(value, res.status);
  }
  const table = (name, query = '') => `/rest/v1/${name}${query ? `?${query}` : ''}`;
  const qeq = (name, value) => `${name}=eq.${encodeURIComponent(String(value))}`;
  const rep = { Prefer: 'return=representation' };
  const getProduct = async id => (await request(table('onda_products', `${qeq('id', id)}&select=*,variants:onda_variants(*)&limit=1`)))?.[0] || null;
  async function listProducts(publishedOnly = false) {
    const result = [];
    for (let offset = 0; ; offset += 200) {
      const rows = await request(table('onda_products', `select=*,variants:onda_variants(*)&order=updated_at.desc,id.asc&limit=200&offset=${offset}${publishedOnly ? '&status=eq.published' : ''}`));
      ensure(Array.isArray(rows), 'Resposta de catalogo invalida.', 502);
      result.push(...rows);
      if (rows.length < 200) return result;
      ensure(result.length < 10000, 'O catalogo exige paginacao adicional. Contate o suporte tecnico.', 503);
    }
  }
  return {
    config,
    publicImageUrl: name => `${url}/storage/v1/object/public/${BUCKET}/${name}`,
    async catalog() {
      const [products, categories, settingsRows] = await Promise.all([
        listProducts(true), request(table('onda_categories', 'select=*&order=name.asc')),
        request(table('onda_settings', 'id=eq.1&select=value&limit=1'))
      ]);
      ensure(settingsRows?.[0], 'Banco incompleto. Execute setup/01-BANCO.sql.', 503);
      return { products, categories, settings: settingsRows[0].value, configured: true };
    },
    listProducts, getProduct,
    async categoryExists(id) { return Boolean((await request(table('onda_categories', `${qeq('id', id)}&select=id&limit=1`)))?.length); },
    async saveProduct(p) { return request('/rest/v1/rpc/onda_save_product', { method: 'POST', data: { _product: p } }); },
    async deleteProduct(id) { await request(table('onda_products', qeq('id', id)), { method: 'DELETE' }); },
    async archiveProduct(id) {
      await request(table('onda_products', qeq('id', id)), { method: 'PATCH', data: { status: 'archived', updated_at: new Date().toISOString() } });
      return getProduct(id);
    },
    async createCategory(id, name) { return (await request(table('onda_categories'), { method: 'POST', data: { id, name }, headers: rep }))[0]; },
    async settings() { const rows = await request(table('onda_settings', 'id=eq.1&select=value&limit=1')); ensure(rows?.[0], 'Instale o banco de dados.', 503); return rows[0].value; },
    async saveSettings(value) { await request(table('onda_settings', 'id=eq.1'), { method: 'PATCH', data: { value, updated_at: new Date().toISOString() } }); return value; },
    async variant(id) { return (await request(table('onda_variants', `${qeq('id', id)}&select=*,product:onda_products!inner(id,name,price_cents,status,is_demo)&limit=1`)))?.[0] || null; },
    async imageExists(name) { return Boolean((await request(table('onda_assets', `${qeq('path', name)}&select=path&limit=1`)))?.length); },
    async upload(name, bytes, mime, userId) {
      await request(`/storage/v1/object/${BUCKET}/${name}`, { method: 'POST', bytes, mime, headers: { 'x-upsert': 'false', 'cache-control': 'max-age=31536000' } });
      try { await request(table('onda_assets'), { method: 'POST', data: { path: name, created_by: userId, size_bytes: bytes.length, mime } }); }
      catch (error) {
        try { await request(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', data: { prefixes: [name] } }); } catch { /* non-sensitive orphan, clean from Storage */ }
        throw error;
      }
      return this.publicImageUrl(name);
    },
    async limit(key, max, seconds) {
      const allowed = await request('/rest/v1/rpc/onda_check_rate', { method: 'POST', data: { _key: key, _limit: max, _seconds: seconds } });
      ensure(allowed === true, 'Muitas tentativas. Aguarde e tente novamente.', 429);
    },
    async signIn(email, password) {
      const result = await request('/auth/v1/token?grant_type=password', { method: 'POST', key: publicKey, data: { email, password }, rawError: true });
      if (result.status === 429) throw new HttpError(429, 'Muitas tentativas. Tente novamente mais tarde.');
      ensure(result.status === 200 && result.value?.user?.id && result.value?.access_token, 'E-mail ou senha invalidos, ou e-mail ainda nao confirmado.', 401);
      const user = result.value.user;
      // Auth checks the password; the site uses its own opaque, revocable HttpOnly session.
      try { await request('/auth/v1/logout?scope=local', { method: 'POST', key: publicKey, bearer: result.value.access_token }); } catch { /* token is never returned to the browser */ }
      const current = await request(`/auth/v1/admin/users/${user.id}`);
      ensure(current?.id && current.updated_at, 'Nao foi possivel verificar a conta.', 401);
      ensure(!(current.factors || []).some(f => f.status === 'verified'), 'Esta conta utiliza MFA. O painel precisa de integracao de MFA antes de aceitar este login.', 403);
      return current;
    },
    async isAdmin(id) { return Boolean((await request(table('onda_admins', `${qeq('user_id', id)}&select=user_id&limit=1`)))?.length); },
    async session(tokenHash) {
      const rows = await request(table('onda_sessions', `${qeq('token_hash', tokenHash)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash,user_id,email,csrf,expires_at,auth_version&limit=1`));
      const row = rows?.[0];
      if (!row || !await this.isAdmin(row.user_id)) return null;
      const result = await request(`/auth/v1/admin/users/${row.user_id}`, { rawError: true });
      const user = result.value;
      if (result.status === 404 || result.status === 401) return null;
      checked(user, result.status);
      const changed = !user?.email_confirmed_at || !user.updated_at ||
        (user.factors || []).some(f => f.status === 'verified') ||
        new Date(user.updated_at).getTime() !== new Date(row.auth_version).getTime() ||
        (user.banned_until && new Date(user.banned_until).getTime() > Date.now());
      if (changed) { await this.deleteSession(tokenHash); return null; }
      return row;
    },
    async createSession(row) {
      await request(table('onda_sessions', `expires_at=lt.${encodeURIComponent(new Date().toISOString())}`), { method: 'DELETE' });
      await request(table('onda_sessions'), { method: 'POST', data: row });
    },
    async deleteSession(tokenHash) { await request(table('onda_sessions', qeq('token_hash', tokenHash)), { method: 'DELETE' }); },
    async diagnostics() {
      await request(table('onda_settings', 'id=eq.1&select=id&limit=1'));
      const bucket = await request(`/storage/v1/bucket/${BUCKET}`);
      ensure(bucket?.id === BUCKET && bucket.public === true, 'Bucket de fotos ausente ou privado. Execute o SQL de instalacao.', 503);
      const admins = await request(table('onda_admins', 'select=user_id&limit=1'));
      return { database: true, storage: true, adminConfigured: Boolean(admins?.length) };
    }
  };
}
