-- STEP 2: First create a user in Supabase > Authentication > Users > Add user.
-- Choose YOUR email/password and check Auto Confirm User.
-- Replace ONLY the email below, then run this entire file in SQL Editor.
-- This grants administrator access to that exact, confirmed account.
do $$
declare
  target_email text := 'SEU_EMAIL_AQUI';
  target_id uuid;
begin
  if target_email='SEU_EMAIL_AQUI' or position('@' in target_email)=0 then
    raise exception 'Substitua SEU_EMAIL_AQUI pelo e-mail que voce criou em Authentication > Users.';
  end if;
  select id into target_id from auth.users
  where lower(email)=lower(trim(target_email)) and email_confirmed_at is not null;
  if target_id is null then
    raise exception 'Usuario confirmado nao encontrado. Crie o usuario e marque Auto Confirm User.';
  end if;
  insert into public.onda_admins(user_id) values(target_id) on conflict(user_id) do nothing;
  raise notice 'Administrador autorizado: %',target_email;
end;
$$;
