-- Local development only: an administrator account for the admin panel.
--   email:    admin@studyos.app
--   password: admin-password-123
do $$
declare v_uid uuid := '22222222-2222-4222-8222-222222222222';
begin
  if not exists (select 1 from auth.users where id = v_uid) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', 'admin@studyos.app',
            crypt('admin-password-123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Platform Admin"}',
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text, jsonb_build_object('sub', v_uid::text, 'email', 'admin@studyos.app', 'email_verified', true), 'email', now(), now(), now());
  end if;
  update public.profiles set is_admin = true, onboarding_completed = true, full_name = 'Platform Admin' where id = v_uid;
end $$;
