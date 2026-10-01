import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../../../core/services/analytics_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/l10n_x.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/states.dart';
import '../data/auth_repository.dart';
import 'auth_layout.dart';

class SignupScreen extends ConsumerStatefulWidget {
  const SignupScreen({super.key});
  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  bool _sent = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final needsConfirm = await ref.read(authRepositoryProvider)
          .signUp(name: _name.text, email: _email.text, password: _password.text);
      ref.read(analyticsProvider).track('signup');
      if (needsConfirm && mounted) setState(() => _sent = true);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    if (_sent) {
      return AuthLayout(
        title: 'Check your inbox',
        subtitle: l.authCheckEmail,
        child: AppButton(label: l.authSignIn, onPressed: () => context.go('/login'), expand: true),
      );
    }
    return AuthLayout(
      title: 'Start free',
      subtitle: 'Set up in under a minute. No card required.',
      child: Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          AppTextField(label: l.authFullName, controller: _name, textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.name], prefixIcon: Icons.person_outline_rounded,
              textCapitalization: TextCapitalization.words, validator: (v) => Validators.required(v, 'Name')),
          const SizedBox(height: Gap.lg),
          AppTextField(label: l.authEmail, controller: _email, keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next, autofillHints: const [AutofillHints.email],
              prefixIcon: Icons.mail_outline_rounded, validator: Validators.email),
          const SizedBox(height: Gap.lg),
          AppTextField(label: l.authPassword, controller: _password, obscure: true,
              autofillHints: const [AutofillHints.newPassword], prefixIcon: Icons.lock_outline_rounded,
              hint: 'At least 8 characters', validator: Validators.password, onSubmitted: (_) => _submit()),
          const SizedBox(height: Gap.xl),
          AppButton(label: l.authSignUp, onPressed: _submit, loading: _loading, expand: true),
          const SizedBox(height: Gap.md),
          Wrap(alignment: WrapAlignment.center, children: [
            const Text('By continuing you agree to our '),
            InkWell(onTap: () => launchUrl(Uri.parse(Env.termsUrl)), child: const Text('Terms', style: TextStyle(decoration: TextDecoration.underline))),
            const Text(' and '),
            InkWell(onTap: () => launchUrl(Uri.parse(Env.privacyUrl)), child: const Text('Privacy Policy', style: TextStyle(decoration: TextDecoration.underline))),
            const Text('.'),
          ]),
          const SizedBox(height: Gap.lg),
          TextButton(onPressed: () => context.go('/login'), child: Text(l.authHaveAccount)),
        ]),
      ),
    );
  }
}
