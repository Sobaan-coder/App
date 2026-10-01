import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/l10n_x.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/states.dart';
import '../data/auth_repository.dart';
import 'auth_layout.dart';

const googleAuthEnabled = bool.fromEnvironment('GOOGLE_AUTH_ENABLED');

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(authRepositoryProvider).signIn(_email.text, _password.text);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AuthLayout(
      title: 'Welcome back',
      subtitle: 'Sign in to keep your business on track.',
      child: Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          AppTextField(
            label: l.authEmail, controller: _email, keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next, autofillHints: const [AutofillHints.email],
            prefixIcon: Icons.mail_outline_rounded, validator: Validators.email,
          ),
          const SizedBox(height: Gap.lg),
          AppTextField(
            label: l.authPassword, controller: _password, obscure: _obscure,
            textInputAction: TextInputAction.done, autofillHints: const [AutofillHints.password],
            prefixIcon: Icons.lock_outline_rounded, onSubmitted: (_) => _submit(),
            validator: (v) => Validators.required(v, 'Password'),
            suffix: IconButton(
              tooltip: _obscure ? 'Show password' : 'Hide password',
              icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton(onPressed: () => context.go('/forgot-password'), child: Text(l.authForgotPassword)),
          ),
          const SizedBox(height: Gap.sm),
          AppButton(label: l.authSignIn, onPressed: _submit, loading: _loading, expand: true),
          if (googleAuthEnabled) ...[
            const SizedBox(height: Gap.md),
            AppButton(
              label: l.authContinueGoogle, variant: AppButtonVariant.secondary, icon: Icons.g_mobiledata_rounded, expand: true,
              onPressed: () async {
                try {
                  await ref.read(authRepositoryProvider).signInWithGoogle();
                } catch (e) {
                  if (context.mounted) showError(context, e);
                }
              },
            ),
          ],
          const SizedBox(height: Gap.xl),
          TextButton(onPressed: () => context.go('/signup'), child: Text(l.authNoAccount)),
        ]),
      ),
    );
  }
}
