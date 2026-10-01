import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/transaction.dart';

/// Quick "Record transaction" chooser (FAB on mobile). AI first, forms second.
Future<void> showRecordSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    builder: (ctx) {
      final t = Theme.of(ctx);
      Widget tile(TransactionType type, String subtitle) => ListTile(
        leading: CircleAvatar(child: Icon(type.icon)),
        title: Text(type.label),
        subtitle: Text(subtitle),
        onTap: () {
          Navigator.pop(ctx);
          context.push('/transactions/new?type=${type.api}');
        },
      );
      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Card(
              color: t.colorScheme.primary,
              child: ListTile(
                leading: Icon(Icons.auto_awesome_rounded, color: t.colorScheme.onPrimary),
                title: Text(
                  'Just tell me what happened',
                  style: TextStyle(color: t.colorScheme.onPrimary, fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '“Sold 3 burgers for 1500 cash”',
                  style: TextStyle(color: t.colorScheme.onPrimary.withValues(alpha: 0.85)),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  context.go('/ai');
                },
              ),
            ),
            const SizedBox(height: Gap.sm),
            tile(TransactionType.sale, 'Money from a customer for goods or services'),
            tile(TransactionType.expense, 'Rent, bills, salaries, transport…'),
            tile(TransactionType.purchase, 'Stock or supplies bought from a supplier'),
            tile(TransactionType.paymentReceived, 'A customer paid what they owed'),
            tile(TransactionType.paymentSent, 'You paid a supplier'),
            tile(TransactionType.income, 'Other money in (commission, interest…)'),
            tile(TransactionType.adjustment, 'Someone owes you / you owe someone'),
          ],
        ),
      );
    },
  );
}
