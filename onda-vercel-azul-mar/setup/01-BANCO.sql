-- ONDA 2.0 | Execute this entire file in Supabase > SQL Editor > New query.
-- Use a NEW Supabase project for this store. No passwords or API keys go here.
-- Re-running this setup preserves existing ONDA products/settings.
begin;

create table if not exists public.onda_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.onda_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references public.onda_admins(user_id) on delete cascade,
  email text not null,
  csrf text not null check (csrf ~ '^[a-f0-9]{64}$'),
  auth_version timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists onda_sessions_expiry_idx on public.onda_sessions(expires_at);
create index if not exists onda_sessions_user_idx on public.onda_sessions(user_id);

create table if not exists public.onda_categories (
  id text primary key,
  name text not null unique check (char_length(trim(name)) between 2 and 60)
);
create table if not exists public.onda_products (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 180),
  name text not null check (char_length(trim(name)) between 2 and 160),
  brand text not null default 'Ralph Lauren' check (char_length(brand) <= 100),
  description text not null default '' check (char_length(description) <= 5000),
  composition text not null default '' check (char_length(composition) <= 2000),
  measurements text not null default '' check (char_length(measurements) <= 2000),
  category_id text not null references public.onda_categories(id),
  price_cents integer not null check (price_cents between 0 and 100000000),
  compare_cents integer check (compare_cents is null or compare_cents between price_cents and 100000000),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  featured boolean not null default false,
  is_demo boolean not null default false check (is_demo = false),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (price_cents > 0 and jsonb_array_length(images) > 0))
);
create index if not exists onda_products_status_idx on public.onda_products(status, updated_at desc);
create index if not exists onda_products_category_idx on public.onda_products(category_id);
create table if not exists public.onda_variants (
  id uuid primary key,
  product_id uuid not null references public.onda_products(id) on delete cascade,
  sku text not null unique check (char_length(trim(sku)) between 1 and 100),
  size text not null check (char_length(trim(size)) between 1 and 30),
  color text not null check (char_length(trim(color)) between 1 and 60),
  stock integer not null default 0 check (stock between 0 and 100000),
  unique(product_id, size, color)
);
create index if not exists onda_variants_product_idx on public.onda_variants(product_id);
create table if not exists public.onda_settings (
  id integer primary key check (id = 1),
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now()
);
create table if not exists public.onda_assets (
  path text primary key check (path ~ '^[a-f0-9-]{36}\.(jpg|png|webp)$'),
  created_by uuid references public.onda_admins(user_id) on delete set null,
  size_bytes integer not null check (size_bytes > 12 and size_bytes <= 3145728),
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now()
);
create index if not exists onda_assets_owner_idx on public.onda_assets(created_by);
create table if not exists public.onda_rate_limits (
  key text primary key check (char_length(key) <= 180),
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null
);
create index if not exists onda_rate_expiry_idx on public.onda_rate_limits(expires_at);

-- All data access goes through authenticated/validated Vercel handlers.
-- RLS is enabled and NO browser policies are granted, even for signed-in users.
alter table public.onda_admins enable row level security;
alter table public.onda_sessions enable row level security;
alter table public.onda_categories enable row level security;
alter table public.onda_products enable row level security;
alter table public.onda_variants enable row level security;
alter table public.onda_settings enable row level security;
alter table public.onda_assets enable row level security;
alter table public.onda_rate_limits enable row level security;
revoke all on table public.onda_admins, public.onda_sessions, public.onda_categories,
  public.onda_products, public.onda_variants, public.onda_settings,
  public.onda_assets, public.onda_rate_limits from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on table public.onda_admins, public.onda_sessions, public.onda_categories,
  public.onda_products, public.onda_variants, public.onda_settings,
  public.onda_assets, public.onda_rate_limits to service_role;

-- Atomic product + variants save; unavailable to anon/authenticated callers.
create or replace function public.onda_save_product(_product jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  p_id uuid := (_product->>'id')::uuid;
  v jsonb;
  result jsonb;
begin
  if jsonb_typeof(_product->'variants') is distinct from 'array'
     or jsonb_array_length(_product->'variants') > 100
     or ((_product->>'status') = 'published' and jsonb_array_length(_product->'variants') = 0) then
    raise exception 'Invalid variants' using errcode = '22023';
  end if;
  insert into public.onda_products (
    id,slug,name,brand,description,composition,measurements,category_id,
    price_cents,compare_cents,status,featured,is_demo,images
  ) values (
    p_id,_product->>'slug',_product->>'name',_product->>'brand',
    coalesce(_product->>'description',''),coalesce(_product->>'composition',''),
    coalesce(_product->>'measurements',''),_product->>'category_id',
    (_product->>'price_cents')::integer,(_product->>'compare_cents')::integer,
    _product->>'status',coalesce((_product->>'featured')::boolean,false),false,_product->'images'
  ) on conflict(id) do update set
    slug=excluded.slug,name=excluded.name,brand=excluded.brand,description=excluded.description,
    composition=excluded.composition,measurements=excluded.measurements,category_id=excluded.category_id,
    price_cents=excluded.price_cents,compare_cents=excluded.compare_cents,status=excluded.status,
    featured=excluded.featured,images=excluded.images,updated_at=now();
  delete from public.onda_variants where product_id=p_id;
  for v in select value from jsonb_array_elements(_product->'variants') loop
    insert into public.onda_variants(id,product_id,sku,size,color,stock)
    values ((v->>'id')::uuid,p_id,v->>'sku',v->>'size',v->>'color',(v->>'stock')::integer);
  end loop;
  select to_jsonb(p) || jsonb_build_object('variants',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.size,x.color)
    from public.onda_variants x where x.product_id=p_id
  ),'[]'::jsonb)) into result from public.onda_products p where p.id=p_id;
  return result;
end;
$$;
revoke execute on function public.onda_save_product(jsonb) from public,anon,authenticated;
grant execute on function public.onda_save_product(jsonb) to service_role;

-- Distributed rate limiter: all Vercel instances share these counters.
create or replace function public.onda_check_rate(_key text,_limit integer,_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if char_length(_key)>180 or _limit<1 or _limit>10000 or _seconds<1 or _seconds>86400 then
    raise exception 'Invalid rate parameters' using errcode='22023';
  end if;
  delete from public.onda_rate_limits where expires_at < now()-interval '1 day';
  insert into public.onda_rate_limits as limits(key,attempts,expires_at)
  values (_key,1,now()+make_interval(secs=>_seconds))
  on conflict(key) do update set
    attempts=case when limits.expires_at<=now() then 1 else least(limits.attempts+1,1000000) end,
    expires_at=case when limits.expires_at<=now() then now()+make_interval(secs=>_seconds) else limits.expires_at end
  returning attempts into n;
  return n<=_limit;
end;
$$;
revoke execute on function public.onda_check_rate(text,integer,integer) from public,anon,authenticated;
grant execute on function public.onda_check_rate(text,integer,integer) to service_role;

-- Product photos are PUBLIC. Never upload IDs, receipts or other private documents.
-- There are no public upload policies. Only the server's secret key can write.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('onda-products','onda-products',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=3145728,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

insert into public.onda_categories(id,name) values
  ('polos','Polos'),('camisas','Camisas'),('tricos',U&'Tric\00f4s'),('calcas',U&'Cal\00e7as')
on conflict(id) do nothing;
insert into public.onda_settings(id,value) values(1,'{"name":"ONDA","announcement":"Uma seleção para vestir o tempo.","hero_title":"O essencial. Além do tempo.","hero_text":"Clássicos Ralph Lauren. Uma curadoria independente para vestir com personalidade, sem pressa.","whatsapp":"","email":"","instagram":"","mode":"preparation","shipping":"Condições de entrega a confirmar com a loja.","returns":"Política de trocas em preparação. Consulte a loja antes de comprar.","about":"A ONDA nasce de uma ideia simples: boas escolhas atravessam estações. Uma seleção independente de peças clássicas, texturas e detalhes para o seu dia a dia."}'::jsonb) on conflict(id) do nothing;
commit;
notify pgrst, 'reload schema';
