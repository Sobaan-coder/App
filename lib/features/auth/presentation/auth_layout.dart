import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/brand_logo.dart';

/// Desktop: brand story on the left, form on the right. Mobile: form only.
class AuthLayout extends StatelessWidget {
  const AuthLayout({super.key, required this.title, required this.subtitle, required this.child});
  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 960;
    final t = Theme.of(context);
    final form = Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Gap.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!wide) ...[const Center(child: BrandLogo()), const SizedBox(height: Gap.xxl)],
                Semantics(header: true, child: Text(title, style: t.textTheme.headlineMedium)),
                const SizedBox(height: Gap.sm),
                Text(subtitle, style: t.textTheme.bodyLarge?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                const SizedBox(height: Gap.xl),
                child,
              ],
            ),
          ),
        ),
      ),
    );
    if (!wide) return Scaffold(body: SafeArea(child: form));
    return Scaffold(
      body: Row(
        children: [
          Expanded(child: _BrandPanel()),
          Expanded(child: form),
        ],
      ),
    );
  }
}

class _BrandPanel extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.brandDark, AppColors.brand],
        ),
      ),
      padding: const EdgeInsets.all(48),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const BrandMark(size: 40),
              const SizedBox(width: 12),
              Text(
                'BusinessPilot',
                style: t.textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const Spacer(),
          Text(
            'Run your business by simply telling us what happened.',
            style: t.textTheme.headlineMedium?.copyWith(color: Colors.white, height: 1.2),
          ),
          const SizedBox(height: 32),
          _bubble(context, 'Sold 5 burgers for Rs 2,500 cash', user: true),
          _bubble(context, '✓ Sale recorded · 5 × Burger · Rs 2,500 · Cash'),
          _bubble(context, 'Paid electricity 4500', user: true),
          _bubble(context, '✓ Expense recorded · Electricity · Rs 4,500'),
          const Spacer(),
          Text('Your Business. One Simple Conversation.', style: t.textTheme.bodyLarge?.copyWith(color: Colors.white70)),
        ],
      ),
    );
  }

  Widget _bubble(BuildContext context, String text, {bool user = false}) => Align(
    alignment: user ? Alignment.centerRight : Alignment.centerLeft,
    child: Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: user ? Colors.white : Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(text, style: TextStyle(color: user ? AppColors.ink : Colors.white, fontSize: 15)),
    ),
  );
}
