import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/date_range.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/l10n_x.dart';
import '../../../shared/widgets/metric_card.dart';
import '../../../shared/widgets/period_selector.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/section_header.dart';
import '../../../shared/widgets/states.dart';
import '../../../shared/widgets/transaction_card.dart';
import '../../auth/data/auth_repository.dart';
import '../../business/data/business_repository.dart';
import '../../transactions/data/transaction_repository.dart';
import '../../transactions/presentation/record_sheet.dart';
import '../data/dashboard_repository.dart';
import '../domain/dashboard_models.dart';
import 'charts.dart';
import 'profit_methodology.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(dashboardFilterProvider);
    final business = ref.watch(businessProvider);
    final user = ref.watch(currentUserProvider);
    final name = (user?.userMetadata?['full_name'] as String?)?.split(' ').first;
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < Breakpoints.compact;
    final pad = compact ? Gap.lg : Gap.xl;

    Future<void> refresh() async {
      ref.invalidate(summaryProvider(filter));
      ref.invalidate(seriesProvider(filter));
      ref.invalidate(recentTransactionsProvider);
      ref.invalidate(lowStockProvider);
      await ref.read(summaryProvider(filter).future);
    }

    return Scaffold(
      appBar: compact
          ? AppBar(
              title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name == null ? context.l10n.navHome : context.l10n.greeting(name), style: Theme.of(context).textTheme.titleLarge),
                const BusinessSwitcher(),
              ]),
              toolbarHeight: 76,
              actions: const [ShellActions()],
            )
          : null,
      floatingActionButton: compact && business.role.canRecord
          ? FloatingActionButton.extended(
              onPressed: () => showRecordSheet(context),
              icon: const Icon(Icons.add_rounded),
              label: Text(context.l10n.actionRecord),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: EdgeInsets.fromLTRB(pad, compact ? Gap.sm : Gap.lg, pad, 96),
          children: [
            if (!compact) ...[
              Text(name == null ? context.l10n.navDashboard : context.l10n.greeting(name),
                  style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: Gap.lg),
            ],
            if (business.business.isDemo) const _DemoNotice(),
            if (business.flags.aiEnabled && business.role.canRecord) const _AskCard(),
            const SizedBox(height: Gap.lg),
            PeriodSelector(value: filter, onChanged: ref.read(dashboardFilterProvider.notifier).set),
            const SizedBox(height: Gap.lg),
            _Metrics(filter: filter, columns: width >= 1100 ? 3 : (width >= 560 ? 3 : 2)),
            const SizedBox(height: Gap.xl),
            if (width >= 1100)
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(flex: 3, child: _TrendCard(filter: filter)),
                const SizedBox(width: Gap.lg),
                Expanded(flex: 2, child: _ExpenseCard(filter: filter)),
              ])
            else ...[
              _TrendCard(filter: filter),
              const SizedBox(height: Gap.lg),
              _ExpenseCard(filter: filter),
            ],
            const SizedBox(height: Gap.lg),
            if (width >= 1100)
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Expanded(flex: 3, child: _RecentCard()),
                const SizedBox(width: Gap.lg),
                Expanded(flex: 2, child: Column(children: [_TopProductsCard(filter: filter), const SizedBox(height: Gap.lg), const _LowStockCard()])),
              ])
            else ...[
              const _RecentCard(),
              const SizedBox(height: Gap.lg),
              _TopProductsCard(filter: filter),
              const SizedBox(height: Gap.lg),
              const _LowStockCard(),
            ],
          ],
        ),
      ),
    );
  }
}

class _DemoNotice extends ConsumerWidget {
  const _DemoNotice();
  @override
  Widget build(BuildContext context, WidgetRef ref) => Card(
        color: Theme.of(context).colorScheme.secondaryContainer,
        child: ListTile(
          leading: const Icon(Icons.storefront_rounded),
          title: const Text('You’re exploring Demo Cafe'),
          subtitle: const Text('Sample data only. Set up your own business when you’re ready.'),
          trailing: TextButton(onPressed: () => context.go('/onboarding?new=1'), child: const Text('Set up mine')),
        ),
      );
}

/// "What happened today?" — the primary action, one tap from the dashboard.
class _AskCard extends StatelessWidget {
  const _AskCard();
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      color: t.colorScheme.primary,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.go('/ai'),
        child: Padding(
          padding: const EdgeInsets.all(Gap.xl),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.auto_awesome_rounded, color: AppColors.accent),
              const SizedBox(width: 10),
              Text(context.l10n.aiDashboardPrompt, style: t.textTheme.titleLarge?.copyWith(color: t.colorScheme.onPrimary)),
            ]),
            const SizedBox(height: Gap.md),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(color: t.colorScheme.onPrimary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                Expanded(
                  child: Text('“${AppConstants.aiExamples.first}”',
                      style: t.textTheme.bodyLarge?.copyWith(color: t.colorScheme.onPrimary.withValues(alpha: 0.85))),
                ),
                Icon(Icons.arrow_forward_rounded, color: t.colorScheme.onPrimary),
              ]),
            ),
            const SizedBox(height: Gap.md),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final e in AppConstants.aiExamples.skip(1).take(3))
                ActionChip(
                  label: Text(e),
                  onPressed: () => context.go('/ai?q=${Uri.encodeComponent(e)}'),
                  backgroundColor: t.colorScheme.onPrimary.withValues(alpha: 0.1),
                  labelStyle: TextStyle(color: t.colorScheme.onPrimary),
                  side: BorderSide(color: t.colorScheme.onPrimary.withValues(alpha: 0.3)),
                ),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _Metrics extends ConsumerWidget {
  const _Metrics({required this.filter, required this.columns});
  final DateFilter filter;
  final int columns;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(summaryProvider(filter));
    final l = context.l10n;
    return AsyncView<DashboardSummary>(
      value: value,
      compact: true,
      onRetry: () => ref.invalidate(summaryProvider(filter)),
      builder: (s) {
        final sem = context.semantic;
        final cards = [
          MetricCard(label: l.dashSales, value: s.sales.format(), icon: Icons.trending_up_rounded, color: sem.income,
              caption: '${s.salesCount} ${s.salesCount == 1 ? 'order' : 'orders'}', onTap: () => context.go('/transactions')),
          MetricCard(label: l.dashExpenses, value: s.expenses.format(), icon: Icons.trending_down_rounded, color: sem.expense,
              caption: s.purchases.isZero ? null : '+ ${s.purchases.format()} stock purchases', onTap: () => context.go('/expenses')),
          MetricCard(
            label: l.dashProfit,
            value: s.netProfit?.format() ?? 'Unavailable',
            icon: Icons.account_balance_wallet_rounded,
            color: s.netProfit == null ? sem.warning : (s.netProfit!.isNegative ? sem.expense : sem.income),
            caption: s.netProfit == null ? 'Cost data incomplete — tap ⓘ' : 'Estimated',
            onInfo: () => showProfitMethodology(context, s),
          ),
          MetricCard(label: l.dashReceivables, value: s.receivables.format(), icon: Icons.call_received_rounded,
              color: sem.warning, onTap: () => context.go('/customers')),
          MetricCard(label: l.dashPayables, value: s.payables.format(), icon: Icons.call_made_rounded,
              color: sem.expense, onTap: () => context.go('/suppliers')),
          MetricCard(label: l.dashLowStock, value: '${s.lowStockCount}', icon: Icons.inventory_2_rounded,
              color: s.lowStockCount > 0 ? sem.warning : sem.income,
              caption: s.lowStockCount == 0 ? 'All good' : 'products need restock', onTap: () => context.go('/inventory?low=1')),
        ];
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (s.fromCache)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('Showing last synced figures', style: Theme.of(context).textTheme.labelMedium),
            ),
          LayoutBuilder(builder: (context, c) {
            const spacing = Gap.md;
            final w = (c.maxWidth - spacing * (columns - 1)) / columns;
            return Wrap(spacing: spacing, runSpacing: spacing, children: [for (final card in cards) SizedBox(width: w, child: card)]);
          }),
        ]);
      },
    );
  }
}

class _CardShell extends StatelessWidget {
  const _CardShell({required this.title, required this.child, this.action, this.onAction});
  final String title;
  final Widget child;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(Gap.lg),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SectionHeader(title, actionLabel: action, onAction: onAction),
            child,
          ]),
        ),
      );
}

class _TrendCard extends ConsumerWidget {
  const _TrendCard({required this.filter});
  final DateFilter filter;
  @override
  Widget build(BuildContext context, WidgetRef ref) => _CardShell(
        title: context.l10n.dashSalesTrend,
        child: AsyncView(value: ref.watch(seriesProvider(filter)), compact: true, builder: (p) => SalesTrendChart(points: p)),
      );
}

class _ExpenseCard extends ConsumerWidget {
  const _ExpenseCard({required this.filter});
  final DateFilter filter;
  @override
  Widget build(BuildContext context, WidgetRef ref) => _CardShell(
        title: context.l10n.dashExpenseBreakdown,
        action: 'Expenses',
        onAction: () => context.go('/expenses'),
        child: AsyncView(value: ref.watch(expenseBreakdownProvider(filter)), compact: true, builder: (items) => BreakdownBars(items: items)),
      );
}

class _RecentCard extends ConsumerWidget {
  const _RecentCard();
  @override
  Widget build(BuildContext context, WidgetRef ref) => _CardShell(
        title: context.l10n.dashRecent,
        action: 'See all',
        onAction: () => context.go('/transactions'),
        child: AsyncView(
          value: ref.watch(recentTransactionsProvider),
          compact: true,
          builder: (txs) => txs.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('No transactions yet. Tell the assistant what happened today, or tap Record.'),
                )
              : Column(children: [
                  for (final tx in txs)
                    TransactionCard(transaction: tx, dense: true, onTap: () => context.push('/transactions/${tx.id}')),
                ]),
        ),
      );
}

class _TopProductsCard extends ConsumerWidget {
  const _TopProductsCard({required this.filter});
  final DateFilter filter;
  @override
  Widget build(BuildContext context, WidgetRef ref) => _CardShell(
        title: context.l10n.dashTopProducts,
        child: AsyncView(
          value: ref.watch(topProductsProvider(filter)),
          compact: true,
          builder: (rows) => rows.isEmpty
              ? const Padding(padding: EdgeInsets.all(8), child: Text('Record sales with items to see your best sellers.'))
              : Column(children: [
                  for (var i = 0; i < rows.length && i < 5; i++)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(radius: 14, child: Text('${i + 1}', style: const TextStyle(fontSize: 13))),
                      title: Text(rows[i].name),
                      subtitle: Text('${Fmt.qty(rows[i].quantity)} sold'),
                      trailing: Text(rows[i].revenue.format(), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                ]),
        ),
      );
}

class _LowStockCard extends ConsumerWidget {
  const _LowStockCard();
  @override
  Widget build(BuildContext context, WidgetRef ref) => _CardShell(
        title: context.l10n.dashLowStock,
        action: 'Inventory',
        onAction: () => context.go('/inventory?low=1'),
        child: AsyncView(
          value: ref.watch(lowStockProvider),
          compact: true,
          builder: (rows) => rows.isEmpty
              ? const Padding(padding: EdgeInsets.all(8), child: Text('Nothing is running low. 👍'))
              : Column(children: [
                  for (final r in rows.take(5))
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.warning_amber_rounded, color: context.semantic.warning),
                      title: Text(r.name),
                      trailing: Text('${Fmt.qty(r.stock)} / ${Fmt.qty(r.minimum)} ${r.unit}'),
                    ),
                ]),
        ),
      );
}
