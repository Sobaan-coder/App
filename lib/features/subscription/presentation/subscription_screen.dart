import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/states.dart';
import '../../business/data/business_repository.dart';
import '../data/payment_provider.dart';
import '../data/subscription_repository.dart';
import '../domain/plan.dart';

class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = ref.watch(businessProvider);
    final usage = ref.watch(planUsageProvider);
    final plans = ref.watch(plansProvider);
    final service = ref.watch(subscriptionServiceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Plan & billing')),
      body: AsyncView<PlanUsage>(
        value: usage,
        onRetry: () => ref.invalidate(planUsageProvider),
        builder: (u) => Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1000),
            child: ListView(
              padding: const EdgeInsets.all(Gap.lg),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(Gap.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Current plan: ${u.plan.name}', style: Theme.of(context).textTheme.titleLarge),
                        if (u.currentPeriodEnd != null)
                          Text('${u.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on ${Fmt.date(u.currentPeriodEnd!)}'),
                        const SizedBox(height: Gap.lg),
                        _meter(context, 'Transactions this month', u.transactionsThisMonth, u.plan.maxTransactionsPerMonth),
                        _meter(context, 'Products', u.products, u.plan.maxProducts),
                        _meter(context, 'Team members', u.users, u.plan.maxUsers),
                        _meter(context, 'AI requests this month', u.aiRequestsThisMonth, u.plan.aiRequestsPerMonth),
                        const SizedBox(height: Gap.sm),
                        Text(
                          'Simple entries understood instantly don’t use AI requests.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: Gap.xl),
                AsyncView<List<Plan>>(
                  value: plans,
                  compact: true,
                  builder: (list) => LayoutBuilder(
                    builder: (context, c) {
                      final cols = c.maxWidth >= 860 ? 3 : 1;
                      final w = (c.maxWidth - (cols - 1) * 16) / cols;
                      return Wrap(
                        spacing: 16,
                        runSpacing: 16,
                        children: [
                          for (final p in list)
                            SizedBox(
                              width: w,
                              child: _PlanCard(
                                plan: p,
                                current: p.id == u.plan.id,
                                canBuy: b.role.canManageBilling,
                                onChoose: () async {
                                  final provider = service.preferred;
                                  final outcome = await provider.purchase(p, businessId: b.id);
                                  if (context.mounted && outcome == PurchaseOutcome.unavailable) {
                                    showMessage(
                                      context,
                                      'In-app purchase isn’t available yet on this device. Please contact us to upgrade.',
                                    );
                                  }
                                },
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ),
                const SizedBox(height: Gap.lg),
                if (!b.role.canManageBilling) const Text('Only the business owner can change the plan.'),
                const Text(
                  'Payments are handled by Google Play or our payment partner. BusinessPilot never stores card details.',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _meter(BuildContext context, String label, int used, int? limit) {
    final ratio = limit == null || limit == 0 ? null : (used / limit).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(label)),
              Text(limit == null ? '$used · unlimited' : '$used / $limit'),
            ],
          ),
          if (ratio != null) ...[
            const SizedBox(height: 4),
            LinearProgressIndicator(
              value: ratio,
              minHeight: 6,
              borderRadius: BorderRadius.circular(4),
              color: ratio > 0.9 ? Theme.of(context).colorScheme.error : null,
            ),
          ],
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.current, required this.canBuy, required this.onChoose});
  final Plan plan;
  final bool current;
  final bool canBuy;
  final VoidCallback onChoose;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      shape: current
          ? RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(Gap.radius),
              side: BorderSide(color: t.colorScheme.primary, width: 2),
            )
          : null,
      child: Padding(
        padding: const EdgeInsets.all(Gap.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(plan.name, style: t.textTheme.titleLarge),
            Text(plan.description, style: t.textTheme.bodyMedium),
            const SizedBox(height: Gap.md),
            Text(plan.isFree ? 'Free' : '${plan.price.format()} / month', style: t.textTheme.headlineSmall),
            const SizedBox(height: Gap.md),
            for (final h in plan.highlights)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Icon(Icons.check_rounded, size: 18, color: t.colorScheme.primary),
                    const SizedBox(width: 8),
                    Expanded(child: Text(h)),
                  ],
                ),
              ),
            const SizedBox(height: Gap.lg),
            SizedBox(
              width: double.infinity,
              child: current
                  ? const OutlinedButton(onPressed: null, child: Text('Current plan'))
                  : FilledButton(
                      onPressed: canBuy && !plan.isFree ? onChoose : null,
                      child: Text(plan.isFree ? 'Free' : 'Choose ${plan.name}'),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
