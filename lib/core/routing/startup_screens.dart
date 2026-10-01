import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/business/data/business_repository.dart';
import '../../shared/widgets/brand_logo.dart';
import '../../shared/widgets/states.dart';
import '../theme/app_theme.dart';

class StartupLoadingScreen extends ConsumerWidget {
  const StartupLoadingScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = ref.watch(membershipsProvider);
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const BrandMark(size: 64),
            const SizedBox(height: Gap.xl),
            if (m.hasError)
              ErrorState(error: m.error!, onRetry: () => ref.invalidate(membershipsProvider))
            else
              const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

/// Shown when the app was built without Supabase configuration. We never
/// fall back to fake data.
class SetupRequiredScreen extends StatelessWidget {
  const SetupRequiredScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(Gap.xl),
            children: [
              const Center(child: BrandLogo(size: 48)),
              const SizedBox(height: Gap.xl),
              Text('Almost there — connect your backend', style: t.textTheme.headlineSmall),
              const SizedBox(height: Gap.md),
              const Text(
                'This build has no Supabase configuration. Create a project, run the migrations, then start the app with:',
              ),
              const SizedBox(height: Gap.md),
              Container(
                padding: const EdgeInsets.all(Gap.md),
                decoration: BoxDecoration(color: t.colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)),
                child: const SelectableText(
                  'flutter run --dart-define-from-file=env/dev.json',
                  style: TextStyle(fontFamily: 'monospace'),
                ),
              ),
              const SizedBox(height: Gap.md),
              const Text('See docs/SETUP.md and docs/SUPABASE.md for step-by-step instructions.'),
            ],
          ),
        ),
      ),
    );
  }
}
