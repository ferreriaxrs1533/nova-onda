-- Read-only checks. Does not change your data.
select tablename,rowsecurity as rls_ativado from pg_tables
where schemaname='public' and tablename like 'onda_%' order by tablename;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='onda-products';
select count(*) as administradores_autorizados from public.onda_admins;
select count(*) as configuracao_inicial from public.onda_settings where id=1;
-- Both values below must be FALSE:
select has_table_privilege('anon','public.onda_products','INSERT') as visitante_pode_cadastrar,
       has_function_privilege('authenticated','public.onda_save_product(jsonb)','EXECUTE') as usuario_comum_pode_cadastrar;
