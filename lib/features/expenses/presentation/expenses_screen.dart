import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/date_range.dart';
import '../../../shared/widgets/period_selector.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/states.dart';
import '../../../shared/widgets/transaction_card.dart';
import '../../business/data/business_repository.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../../dashboard/presentation/charts.dart';
import '../../transactions/data/transaction_repository.dart';
import '../../transactions/domain/transaction.dart';
import '../data/expense_category_repository.dart';

class ExpensesScreen extends ConsumerStatefulWidget {
  const ExpensesScreen({super.key});
  @override
  ConsumerState<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends ConsumerState<ExpensesScreen> {
  DateFilter _filter = const DateFilter(DatePreset.thisMonth);
  static const _query = TransactionQuery(types: {TransactionType.expense});

  @override
  Widget build(BuildContext context) {
    final business = ref.watch(businessProvider);
    final list = ref.watch(transactionListProvider(_query));
    return Scaffold(
      appBar: AppBar(title: const Text('Expenses'), actions: [
        if (business.role.canEditCatalogue)
          IconButton(tooltip: 'Manage categories', onPressed: () => _categories(context), icon: const Icon(Icons.category_outlined)),
        const ShellActions(),
      ]),
      floatingActionButton: business.role.canRecord
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/transactions/new?type=expense'),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Expense'))
          : null,
      body: ListView(padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.sm, Gap.lg, 96), children: [
        PeriodSelector(value: _filter, onChanged: (f) => setState(() => _filter = f)),
        const SizedBox(height: Gap.lg),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(Gap.lg),
            child: AsyncView(
              value: ref.watch(summaryProvider(_filter)),
              compact: true,
              builder: (s) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Spent ${_filter.label.toLowerCase()}', style: Theme.of(context).textTheme.bodyMedium),
                Text(s.expenses.format(), style: Theme.of(context).textTheme.headlineMedium),
                if (!s.purchases.isZero) Text('Plus ${s.purchases.format()} on stock purchases'),
                const SizedBox(height: Gap.lg),
                AsyncView(value: ref.watch(expenseBreakdownProvider(_filter)), compact: true, builder: (items) => BreakdownBars(items: items, max: 12)),
              ]),
            ),
          ),
        ),
        const SizedBox(height: Gap.lg),
        Text('Recent expenses', style: Theme.of(context).textTheme.titleMedium),
        if (list.items.isEmpty && list.loading) const LoadingState(),
        if (list.items.isEmpty && !list.loading)
          const Padding(padding: EdgeInsets.all(16), child: Text('No expenses yet. Try telling the assistant “Paid electricity 4500”.')),
        for (final tx in list.items) TransactionCard(transaction: tx, onTap: () => context.push('/transactions/${tx.id}')),
        if (list.hasMore && list.items.isNotEmpty)
          TextButton(onPressed: () => ref.read(transactionListProvider(_query).notifier).loadMore(), child: const Text('Load more')),
      ]),
    );
  }

  Future<void> _categories(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (ctx) => Consumer(builder: (ctx, ref, _) {
          final cats = ref.watch(expenseCategoriesProvider).value ?? const [];
          final add = TextEditingController();
          return Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(ctx).bottom + 16),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Expense categories', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 8),
              Flexible(
                child: ListView(shrinkWrap: true, children: [
                  for (final c in cats)
                    ListTile(
                      title: Text(c.name),
                      subtitle: c.isDefault ? const Text('Default') : null,
                      trailing: IconButton(
                        tooltip: 'Rename',
                        icon: const Icon(Icons.edit_outlined),
                        onPressed: () async {
                          final ctrl = TextEditingController(text: c.name);
                          final name = await showDialog<String>(
                            context: ctx,
                            builder: (d) => AlertDialog(
                              title: const Text('Rename category'),
                              content: TextField(controller: ctrl, autofocus: true),
                              actions: [
                                TextButton(onPressed: () => Navigator.pop(d), child: const Text('Cancel')),
                                FilledButton(onPressed: () => Navigator.pop(d, ctrl.text), child: const Text('Save')),
                              ],
                            ),
                          );
                          if (name != null && name.trim().isNotEmpty) {
                            try {
                              await ref.read(expenseCategoryRepositoryProvider).rename(c.id, name);
                            } catch (e) {
                              if (ctx.mounted) showError(ctx, e);
                            }
                          }
                        },
                      ),
                    ),
                ]),
              ),
              Row(children: [
                Expanded(child: TextField(controller: add, decoration: const InputDecoration(labelText: 'New category'))),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () async {
                    if (add.text.trim().isEmpty) return;
                    try {
                      await ref.read(expenseCategoryRepositoryProvider).add(add.text);
                      add.clear();
                    } catch (e) {
                      if (ctx.mounted) showError(ctx, e);
                    }
                  },
                  child: const Text('Add'),
                ),
              ]),
            ]),
          );
        }),
      );
}
