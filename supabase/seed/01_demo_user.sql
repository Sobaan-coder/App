-- ============================================================================
-- Local development only (run by `supabase db reset` via config.toml).
-- Creates a ready-to-use demo account:
--   email:    demo@studyos.app
--   password: demo-password-123
-- and fills it with the CA Pakistan / FAR demo workspace.
-- Do NOT run this against production.
-- ============================================================================
do $$
declare v_uid uuid := '11111111-1111-4111-8111-111111111111';
begin
  if not exists (select 1 from auth.users where id = v_uid) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'demo@studyos.app', crypt('demo-password-123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Student"}', now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text,
            jsonb_build_object('sub', v_uid::text, 'email', 'demo@studyos.app', 'email_verified', true),
            'email', now(), now(), now());
  end if;

  -- Run the demo builder as the demo user so auth.uid() resolves to them.
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform public.create_demo_workspace();
  update public.profiles set full_name = 'Demo Student' where id = v_uid;
end $$;
