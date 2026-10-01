import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/services/offline_queue.dart';
import '../../../core/utils/l10n_x.dart';
import '../../../core/utils/money.dart';
import '../../../shared/widgets/responsive_scaffold.dart';
import '../../../shared/widgets/states.dart';
import '../../../shared/widgets/transaction_card.dart';
import '../../business/data/business_repository.dart';
import '../data/transaction_repository.dart';
import '../domain/transaction.dart';
import 'record_sheet.dart';

class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key, this.initialTypes = const {}, this.title});
  final Set<TransactionType> initialTypes;
  final String? title;

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  late Set<TransactionType> _types = widget.initialTypes;
  final _scroll = ScrollController();

  static const _filters = [
    TransactionType.sale, TransactionType.expense, TransactionType.purchase,
    TransactionType.paymentReceived, TransactionType.paymentSent, TransactionType.income, TransactionType.adjustment,
  ];

  TransactionQuery get _query => TransactionQuery(types: _types);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) {
        ref.read(transactionListProvider(_query).notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(transactionListProvider(_query));
    final business = ref.watch(businessProvider);
    final pending = ref.watch(offlineQueueProvider).where((o) => o.businessId == business.id).toList();
    final compact = Breakpoints.isCompact(context);

    // Offline entries are shown first, clearly marked, until the server confirms them.
    final pendingTx = [
      for (final op in pending)
        AppTransaction(
          id: op.id,
          businessId: op.businessId,
          type: TransactionType.fromApi(op.payload['type'] as String? ?? 'sale'),
          amount: Money((op.payload['amount_minor'] as num?)?.toInt() ?? 0, business.currency),
          paymentMethod: PaymentMethod.fromApi(op.payload['payment_method'] as String?),
          description: op.summary,
          transactionDate: op.createdAt,
          createdAt: op.createdAt,
          pending: true,
        ),
    ].where((t) => _types.isEmpty || _types.contains(t.type)).toList();

    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? context.l10n.navTransactions), actions: const [ShellActions()]),
      floatingActionButton: compact && business.role.canRecord
          ? FloatingActionButton(tooltip: context.l10n.recordTransaction, onPressed: () => showRecordSheet(context), child: const Icon(Icons.add_rounded))
          : null,
      body: Column(children: [
        SizedBox(
          height: 56,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), children: [
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: FilterChip(label: const Text('All'), selected: _types.isEmpty, onSelected: (_) => setState(() => _types = {})),
            ),
            for (final f in _filters)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: FilterChip(
                  label: Text(f.label),
                  selected: _types.contains(f),
                  onSelected: (on) => setState(() => _types = on ? {..._types, f} : (_types.toSet()..remove(f))),
                ),
              ),
          ]),
        ),
        Expanded(
          child: Builder(builder: (context) {
            if (state.items.isEmpty && state.loading) return const LoadingState();
            if (state.items.isEmpty && state.error != null) {
              return ErrorState(error: state.error!, onRetry: () => ref.read(transactionListProvider(_query).notifier).refresh());
            }
            final all = [...pendingTx, ...state.items];
            if (all.isEmpty) {
              return EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'No transactions yet',
                message: 'Tell the assistant what happened, or record one manually.',
                actionLabel: business.role.canRecord ? context.l10n.recordTransaction : null,
                onAction: () => showRecordSheet(context),
              );
            }
            return RefreshIndicator(
              onRefresh: () => ref.read(transactionListProvider(_query).notifier).refresh(),
              child: ListView.separated(
                controller: _scroll,
                padding: const EdgeInsets.only(bottom: 96),
                itemCount: all.length + (state.hasMore ? 1 : 0),
                separatorBuilder: (_, _) => const Divider(indent: 72),
                itemBuilder: (context, i) {
                  if (i >= all.length) {
                    return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
                  }
                  final tx = all[i];
                  return TransactionCard(transaction: tx, onTap: tx.pending ? null : () => context.push('/transactions/${tx.id}'));
                },
              ),
            );
          }),
        ),
      ]),
    );
  }
}
